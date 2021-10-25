import * as core from '@actions/core'
import {SimpleInstance} from './models/simple-instance'
import {EC2Service} from './services/ec2.service'

async function run(entryTime: Date = new Date()): Promise<void> {
  const timeout: number = +core.getInput('timeout') || 60

  try {
    const region: string = core.getInput('region')
    const action: string = core.getInput('action')
    const label: string = core.getInput('label')
    const token: string = core.getInput('token')
    const runners: number = +core.getInput('runners')

    const ec2: EC2Service = new EC2Service(region, token)

    if (action.toLowerCase() === 'start') {
      if (label) {
        try {
          const instances: SimpleInstance[] = await ec2.getFreeInstances(
            label,
            runners
          )
          ec2.startInstances(instances.map(x => x.id))
          if (instances.length < runners) {
            core.warning(
              `Could only start ${instances.length} of the requested ${runners} instance(s)`
            )
          }
          core.setOutput('ids', instances.map(x => x.id).join(' '))
          core.setOutput('started', instances.length)
        } catch (e) {
          throw e
        }
      } else {
        throw new Error('label is required')
      }
    } else if (action.toLowerCase() === 'stop') {
      let stoppedInstanceCount = 0
      const startTime: number = Date.now()

      while (stoppedInstanceCount < runners) {
        const elapsedTime = Date.now() - startTime
        if (elapsedTime / 1000 >= timeout) {
          break
        }

        core.info(
          `Have stopped ${stoppedInstanceCount} of ${runners} instances after ${Math.round(
            elapsedTime / 1000
          )} seconds..`
        )

        const idleInstances: SimpleInstance[] = await ec2.getIdleInstances(
          label,
          runners - stoppedInstanceCount
        )
        const instanceIds = idleInstances.map(instance => instance.id)

        if (instanceIds.length > 0) {
          ec2.stopInstances(instanceIds)
          stoppedInstanceCount += instanceIds.length
        } else {
          core.info('No current idle instances available to stop..')
        }
      }

      if (stoppedInstanceCount < runners) {
        core.warning(
          `Heads up! Only shut down ${stoppedInstanceCount} of ${runners} instances after 5 minutes..`
        )
      } else {
        core.info(
          `Successfully shut down ${stoppedInstanceCount} of ${runners} instances!`
        )
      }
    } else if (action.toLowerCase() === 'test') {
      core.info('Able to trigger action run!')
    } else {
      throw new Error(`(${action}) is not a valid action`)
    }
  } catch (error) {
    if ((new Date().getTime() - entryTime.getTime()) / 1000 > timeout) {
      core.setFailed(error.message)
    } else {
      core.info(`Error ${error.message}. Attempting again in 5 seconds...`)
      setTimeout(() => {
        run(entryTime)
      }, 5000)
    }
  }
}

run()
