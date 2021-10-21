import {Octokit} from '@octokit/rest'
import * as core from '@actions/core'

const github = new Octokit({
  auth: `token ${core.getInput('token')}`,
  userAgent: 'Hipcamp'
})

export default github
