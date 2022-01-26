import * as core from '@actions/core'
import {ControllerService} from './services/controller.service'

async function run(
  entryTime: Date = new Date(),
  modifiedIds: string[] = []
): Promise<void> {
  const region: string = core.getInput('region')
  const label: string = core.getInput('label')
  const token: string = core.getInput('token')
  const timeout: number = +core.getInput('timeout') || 600
  const action: string = core.getInput('action')
  const runners: number = +core.getInput('runners')
  const block: number = +core.getInput('block')

  core.setOutput('requested', runners)

  // check for label
  if (!label) {
    core.error('(label) is a required parameter')
  }
  core.setOutput('label', label)

  const controller: ControllerService = new ControllerService(region, token)

  const formattedAction = action.toLowerCase()

  if (formattedAction === 'start') {
    try {
      while (modifiedIds.length < runners) {
        const elapsedTime = Date.now() - entryTime.getTime()
        if (elapsedTime / 1000 >= timeout) {
          throw new Error('start timeout has exceeded')
        }

        core.info(
          `Have run action (${formattedAction}) on ${
            modifiedIds.length
          } of ${runners} instances after ${Math.round(
            elapsedTime / 1000
          )} seconds..`
        )

        const neededRunners: number = runners - modifiedIds.length

        const instancesStarted = (
          await controller.startInstances(
            label,
            block <= neededRunners ? block : neededRunners,
            modifiedIds
          )
        ).map(x => x.id)

        modifiedIds.push(...instancesStarted)
      }

      core.setOutput('started', modifiedIds.length)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if ((new Date().getTime() - entryTime.getTime()) / 1000 >= timeout) {
        if (modifiedIds.length === 0) {
          core.setFailed(
            `Heads up! Was not able to start any of the ${runners} required runners..`
          )
        } else {
          core.warning(
            `Heads up! Only was able to start ${modifiedIds.length} of ${runners} runners..`
          )
        }
        core.setOutput('started', modifiedIds.length)
      } else {
        core.info(`${error.message}. Attempting again in 5 seconds...`)
        setTimeout(() => {
          run(entryTime, modifiedIds)
        }, 5000)
      }
    }
  } else if (formattedAction === 'cleanup') {
    const instancesStopped = await controller.cleanupInstances()
    core.info(`Successfully Cleaned Up (${instancesStopped.length}) instances!`)
  } else {
    const instancesStopped = await controller.stopInstances(label)
    core.info(`Successfully Stopped (${instancesStopped.length}) instances!`)
  }
}

run()
