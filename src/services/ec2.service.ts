import {EC2} from 'aws-sdk'
import {SimpleInstance} from '../models/simple-instance'

export class EC2Service {
  private _client: EC2
  region: string

  constructor(region: string) {
    this.region = region
    const options: EC2.ClientConfiguration = {
      region
    }
    this._client = new EC2(options)
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

  async getFreeInstance(label: string): Promise<SimpleInstance> {
    return new Promise(async (resolve, reject) => {
      const instances: SimpleInstance[] = await this.getInstances()
      const selection: SimpleInstance | undefined = instances.find(
        x =>
          x.labels.findIndex(k => k.toLowerCase() === label.toLowerCase()) >
            -1 && x.status === 'stopped'
      )

      if (selection) {
        resolve(selection)
      } else {
        reject(new Error('No instances available.'))
      }
    })
  }

  startInstance(id: string): void {
    this._client.startInstances({InstanceIds: [id]}).send()
  }

  stopInstance(id: string): void {
    this._client.stopInstances({InstanceIds: [id]}).send()
  }
}
