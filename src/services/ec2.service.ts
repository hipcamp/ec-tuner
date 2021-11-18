import {
  EC2Client,
  EC2ClientConfig,
  DescribeInstancesCommand,
  DescribeInstancesCommandInput,
  DescribeInstancesCommandOutput,
  StartInstancesCommand,
  StartInstancesCommandInput,
  StartInstancesCommandOutput,
  StopInstancesCommand,
  StopInstancesCommandInput,
  StopInstancesCommandOutput
} from '@aws-sdk/client-ec2'
import {SimpleInstance} from '../models/simple-instance'
import {Octokit} from '@octokit/rest'
import * as core from '@actions/core'

export class EC2Service {
  private readonly _client: EC2Client
  private readonly _github: Octokit
  private readonly organization: string

  constructor(region: string, token: string) {
    const options: EC2ClientConfig = {
      region
    }
    this._client = new EC2Client(options)
    this._github = new Octokit({
      auth: `token ${token}`
    })
    this.organization = (process.env['GITHUB_REPOSITORY'] as string).split(
      '/'
    )[0]
    core.debug(`set organization to: ${this.organization}`)
  }

  async getInstances(instanceIds: string[] = []): Promise<SimpleInstance[]> {
    const params: DescribeInstancesCommandInput = {}
    if (instanceIds.length > 0) {
      params.InstanceIds = instanceIds
    }
    const command = new DescribeInstancesCommand(params)

    try {
      const data: DescribeInstancesCommandOutput = await this._client.send(
        command
      )

      const instances: SimpleInstance[] = []
      if (data.Reservations) {
        for (const reservation of data.Reservations) {
          if (reservation.Instances) {
            for (const instance of reservation.Instances) {
              instances.push({
                id: instance.InstanceId || '',
                privateIp: instance.PrivateIpAddress || '',
                status: instance.State?.Name || '',
                type: instance.InstanceType || '',
                labels:
                  instance.Tags?.find(x => x.Key === 'labels')?.Value?.split(
                    ','
                  ) || []
              })
            }
          }
        }
      }
      return instances
    } catch (err) {
      core.error(err)
      return []
    }
  }

  async instancesStarted(instanceIds: string[]): Promise<boolean> {
    const instances: SimpleInstance[] = await this.getInstances(instanceIds)
    return (
      instances
        .map(x => x.status.toLowerCase())
        .findIndex(x => x === 'stopped') === -1
    )
  }

  async getFreeInstances(
    label: string,
    runners = 1
  ): Promise<SimpleInstance[]> {
    return new Promise(async (resolve, reject) => {
      const instances: SimpleInstance[] = await this.getInstances()
      const filteredInstances: SimpleInstance[] = instances.filter(
        x =>
          x.labels.findIndex(k => k.toLowerCase() === label.toLowerCase()) >
            -1 && x.status === 'stopped'
      )

      if (filteredInstances.length > 0) {
        resolve(filteredInstances.slice(0, runners))
      } else {
        // TODO: Add messaging for when not enough runners are available, and potential retry logic
        // TODO: add some alerting here
        reject(new Error('No free instances available.'))
      }
    })
  }

  async getIdleInstances(
    label: string,
    runners = 1
  ): Promise<SimpleInstance[]> {
    return new Promise(async (resolve, reject) => {
      const instances: SimpleInstance[] = await this.getInstances()

      const runningInstances: SimpleInstance[] = instances.filter(
        x =>
          x.labels.findIndex(k => k.toLowerCase() === label.toLowerCase()) >
            -1 && x.status === 'running'
      )

      const githubIdleRunnerIps = await this.getGithubIdleRunnerIps()

      const idleInstances: SimpleInstance[] = runningInstances.filter(
        (instance: SimpleInstance) => {
          return githubIdleRunnerIps.includes(instance.privateIp)
        }
      )

      if (idleInstances.length !== 0) {
        resolve(idleInstances.slice(0, runners))
      } else {
        reject(new Error('No idle instances exist.'))
      }
    })
  }

  async getGithubIdleRunnerIps(): Promise<string[]> {
    const response = await this._github.paginate(
      'GET /orgs/{org}/actions/runners',
      {
        org: this.organization
      }
    )

    const idleRunnerIps: string[] = []
    for (const runner of response) {
      if (runner.status === 'online' && runner.busy === false) {
        idleRunnerIps.push(
          runner.name
            .replace(/^ip-/i, '')
            .replace(/-\d+$/i, '')
            .replace(/-/g, '.')
        )
      }
    }

    return idleRunnerIps
  }

  async anyStoppedInstanceRunning(privateIps: string[]): Promise<boolean> {
    const githubIps = privateIps.map(ip => `ip-${ip}-1`.replace(/\./g, '-'))

    const response = await this._github.paginate(
      'GET /orgs/{org}/actions/runners',
      {
        org: this.organization
      }
    )

    for (const runner of response) {
      if (githubIps.includes(runner.name) && runner.status === 'online') {
        return true
      }
    }

    return false
  }

  async startInstances(label: string, requested: number): Promise<number> {
    try {
      const ids: string[] = (await this.getFreeInstances(label, requested)).map(
        x => x.id
      )
      const params: StartInstancesCommandInput = {
        InstanceIds: ids
      }
      const command: StartInstancesCommand = new StartInstancesCommand(params)
      const data: StartInstancesCommandOutput = await this._client.send(command)
      core.debug(JSON.stringify(data.StartingInstances))
      const startedIds: string[] =
        (data.StartingInstances?.map(x => x.InstanceId) as string[]) || []
      for (let i = 0; i < 5; i++) {
        setTimeout(async () => {
          if (await this.instancesStarted(startedIds)) {
            return startedIds.length
          }
        }, 1000 * i)
      }
      return 0
    } catch (err) {
      core.warning(err)
      return 0
    }
  }

  async stopInstances(ids: string[]): Promise<void> {
    try {
      const params: StopInstancesCommandInput = {
        InstanceIds: ids
      }
      const command: StopInstancesCommand = new StopInstancesCommand(params)
      const data: StopInstancesCommandOutput = await this._client.send(command)
      core.debug(JSON.stringify(data.StoppingInstances))
    } catch (err) {
      core.error(err)
    }
  }
}
