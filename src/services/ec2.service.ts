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
import * as core from '@actions/core'

export class EC2Service {
  private readonly _client: EC2Client

  constructor(region: string) {
    const options: EC2ClientConfig = {
      region
    }
    this._client = new EC2Client(options)
  }

  async getEC2Instances(instanceIds: string[] = []): Promise<SimpleInstance[]> {
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

  async getEC2InstancesByPrivateIps(
    ips: string[] = []
  ): Promise<Map<string, SimpleInstance>> {
    const instances: SimpleInstance[] = await this.getEC2Instances()

    const instanceMap: Map<string, SimpleInstance> = new Map()

    for (const instance of instances) {
      if (instance.privateIp && ips.includes(instance.privateIp)) {
        instanceMap.set(instance.privateIp, instance)
      }
    }

    return instanceMap
  }

  private async getFilteredEC2Instances(
    label: string,
    status: string,
    instanceIds: string[] = []
  ): Promise<SimpleInstance[]> {
    const instances: SimpleInstance[] = await this.getEC2Instances(instanceIds)
    const filteredInstances: SimpleInstance[] = instances.filter(x => {
      return x.labels.includes(label.toLowerCase()) && x.status === status
    })

    return filteredInstances
  }

  async getStoppedEC2Instances(
    label: string,
    instanceIds: string[] = []
  ): Promise<SimpleInstance[]> {
    return this.getFilteredEC2Instances(label, 'stopped', instanceIds)
  }

  async getRunningEC2Instances(
    label: string,
    instanceIds: string[] = []
  ): Promise<SimpleInstance[]> {
    return this.getFilteredEC2Instances(label, 'running', instanceIds)
  }

  async startInstances(ids: string[]): Promise<string[]> {
    try {
      const params: StartInstancesCommandInput = {
        InstanceIds: ids
      }
      const command: StartInstancesCommand = new StartInstancesCommand(params)
      const data: StartInstancesCommandOutput = await this._client.send(command)
      core.debug(JSON.stringify(data.StartingInstances))
      return data.StartingInstances?.map(x => x.InstanceId) as string[]
    } catch (err) {
      throw err
    }
  }

  async stopInstances(ids: string[]): Promise<string[]> {
    try {
      const params: StopInstancesCommandInput = {
        InstanceIds: ids
      }
      const command: StopInstancesCommand = new StopInstancesCommand(params)
      const data: StopInstancesCommandOutput = await this._client.send(command)
      core.debug(JSON.stringify(data.StoppingInstances))
      return data.StoppingInstances?.map(x => x.InstanceId) as string[]
    } catch (err) {
      throw err
    }
  }
}
