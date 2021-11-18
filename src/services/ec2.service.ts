import {EC2} from 'aws-sdk'
import {SimpleInstance} from '../models/simple-instance'
import {Octokit} from '@octokit/rest'
import * as core from '@actions/core'

export class EC2Service {
  private readonly _client: EC2
  private readonly _github: Octokit
  private readonly organization: string

  constructor(region: string, token: string) {
    const options: EC2.ClientConfiguration = {
      region
    }
    this._client = new EC2(options)
    this._github = new Octokit({
      auth: `token ${token}`
    })
    this.organization = (process.env['GITHUB_REPOSITORY'] as string).split(
      '/'
    )[0]
    core.debug(`set organization to: ${this.organization}`)
  }

  async getInstances(): Promise<SimpleInstance[]> {
    return new Promise((resolve, reject) => {
      this._client.describeInstances((err, data) => {
        const instances: SimpleInstance[] = []
        if (err) {
          reject(err)
        } else {
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
                      instance.Tags?.find(
                        x => x.Key === 'labels'
                      )?.Value?.split(',') || []
                  })
                }
              }
            }
          }
          resolve(instances)
        }
      })
    })
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

  startInstances(ids: string[]): void {
    try {
      this._client
        .startInstances({InstanceIds: ids})
        .promise()
        // eslint-disable-next-line github/no-then
        .then(resp => {
          core.info(JSON.stringify(resp))
        })
        // eslint-disable-next-line github/no-then
        .catch(err => {
          core.error(err)
        })
    } catch (err) {
      core.error(err)
    }
  }

  stopInstances(ids: string[]): void {
    // TODO: Add logic for only stopping an instance when it is idle in GitHub. Consider conditions in which a runner is started, but another job picks it up.
    this._client.stopInstances({InstanceIds: ids}).send()
  }
}
