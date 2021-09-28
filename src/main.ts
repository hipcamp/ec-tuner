import * as core from '@actions/core'
import {EC2Service} from './services/ec2.service'

async function run(entryTime: Date = new Date()): Promise<void> {
  const timeout: number = +core.getInput('timeout') || 60

  try {
    const region: string = core.getInput('region')
    const action: string = core.getInput('action')
    const label: string = core.getInput('label')
    const instanceId: string = core.getInput('instance')

    const ec2: EC2Service = new EC2Service(region)

    if (action.toLowerCase() === 'start') {
      if (instanceId) {
        ec2.startInstance(instanceId)
        core.setOutput('id', instanceId)
      } else {
        if (label) {
          try {
            const instance = await ec2.getFreeInstance(label)
            ec2.startInstance(instance.id)
            core.setOutput('id', instance.id)
          } catch (e) {
            throw e
          }
        } else {
          throw new Error('label is required when instance is not provided')
        }
      }
    } else if (action.toLowerCase() === 'stop') {
      if (instanceId) {
        ec2.stopInstance(instanceId)
        core.setOutput('id', instanceId)
      } else {
        throw new Error('instance is required to run stop action')
      }
    } else {
      throw new Error(`(${action}) is not a valid action`)
    }
  } catch (error) {
    if ((new Date().getTime() - entryTime.getTime()) / 1000 > timeout) {
      core.setFailed(error.message)
    } else {
      setTimeout(() => {
        run(entryTime)
      }, 5000)
    }
  }
}

run()
