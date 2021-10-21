import * as core from '@actions/core'
import {SimpleInstance} from './models/simple-instance'
import {EC2Service} from './services/ec2.service'

async function run(entryTime: Date = new Date()): Promise<void> {
  const timeout: number = +core.getInput('timeout') || 60

  try {
    const region: string = core.getInput('region')
    const action: string = core.getInput('action')
    const label: string = core.getInput('label')
    const instanceIds: string[] = core.getInput('instances')
      ? core.getInput('instances').split(' ')
      : []
    const runners: number = +core.getInput('runners')

    const ec2: EC2Service = new EC2Service(region)

    if (action.toLowerCase() === 'start') {
      if (instanceIds.length > 0) {
        ec2.startInstances(instanceIds)
        core.setOutput('ids', instanceIds.join(' '))
      } else {
        if (label) {
          try {
            const instances: SimpleInstance[] = await ec2.getFreeInstances(
              label,
              runners
            )
            ec2.startInstances(instances.map(x => x.id))
            core.setOutput('ids', instances.map(x => x.id).join(' '))
          } catch (e) {
            throw e
          }
        } else {
          throw new Error('label is required when instance is not provided')
        }
      }
    } else if (action.toLowerCase() === 'stop') {
      let stoppedInstanceCount: number = 0
      const stopTimeout: number = 300000 // 5 minutes
      const startTime: number = Date.now()

      while (stoppedInstanceCount < runners) {
        let elapsedTime = Date.now() - startTime
        if (elapsedTime >= stopTimeout) {
          break;
        }

        core.info(`Have stopped ${stoppedInstanceCount} of ${runners} instances after ${Math.round(elapsedTime / 1000)} seconds..`)

        let idleInstances: SimpleInstance[] = await ec2.getIdleInstances(
          label,
          (runners - stoppedInstanceCount)
        )
        let instanceIds = idleInstances.map(instance => instance.id)

        if (instanceIds.length > 0) {
          ec2.stopInstances(instanceIds)
          stoppedInstanceCount += instanceIds.length
        } else {
          core.info('No current idle instances available to stop..')
        }
      }

      if (stoppedInstanceCount < runners) {
        core.info(`Heads up! Only shut down ${stoppedInstanceCount} of ${runners} instances after 5 minutes..`)
      } else {
        core.info(`Successfully shut down ${stoppedInstanceCount} of ${runners} instances!`)
      }

    } else {
      throw new Error(`(${action}) is not a valid action`)
    }
  } catch (error) {
    if ((new Date().getTime() - entryTime.getTime()) / 1000 > timeout) {
      core.setFailed(error.message)
    } else {
      core.info('could not reserve instance(s), attempting again in 5 seconds')
      setTimeout(() => {
        run(entryTime)
      }, 5000)
    }
  }
}

run()
