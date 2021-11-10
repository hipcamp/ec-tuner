## Usage

### Pre-requisites
Create a workflow `.yml` file in your repositories `.github/workflows` directory. An [example workflow](#example-workflow) is available below. For more information, reference the GitHub Help Documentation for [Creating a workflow file](https://help.github.com/en/articles/configuring-a-workflow#creating-a-workflow-file).

### Inputs

* `region` - selected region for EC2 instances
* `action` - stop or start
* `label` - the label to filter EC2 instances with
* `timeout` - time to wait for a matching instance (seconds) *OPTIONAL: Default 60 Seconds*
* `runners` - the amount of runners to start with matching labels *OPTIONAL: Default 1*
* `token` - the gha token for getting idle status runners from github api

### Outputs

* `ids` - ids of the affected EC2 instances
* `label` - the label used to start the runners
* `started` - number of runners started by this action

### Example Workflow

```yaml
name: Use Self-Hosted Runners
on: push
jobs:
  start-self-hosted-runners:
    name: Start Self-Hosted Runners
    runs-on: ubuntu-latest
    outputs:
      started: ${{steps.start.outputs.started}}
      label: ${{steps.start.outputs.label}}
    steps:
      - name: Install AWS CLI
        run: |
          wget https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip
          unzip awscli-exe-linux-x86_64.zip
          sudo ./aws/install --update
      - id: start
        name: Start Self-Hosted Runners
        uses: hipcamp/ec-tuner@v1
        env:
          AWS_DEFAULT_REGION: "us-east-1"
          AWS_ACCESS_KEY_ID: ${{secrets.RUNNER_ACCESS_KEY_ID}}
          AWS_SECRET_ACCESS_KEY: ${{secrets.RUNNER_ACCESS_KEY_SECRET}}
          AWS_ACCOUNT: ${{secrets.AWS_ACCOUNT}}
        with:
          region: ${{env.AWS_DEFAULT_REGION}}
          action: start
          label: basic
          runners: 1
  example:
    name: Run Job on Self-Hosted Runner
    runs-on: basic
    steps:
      - run: echo "This is an example."
  stop-self-hosted-runners:
    name: Stop Self-Hosted Runners
    needs: [start-self-hosted-runners, example]
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Install AWS CLI
        run: |
          wget https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip
          unzip awscli-exe-linux-x86_64.zip
          sudo ./aws/install --update
      - name: Stop Self-Hosted Runners
        uses: hipcamp/ec-tuner@v1
        env:
          AWS_DEFAULT_REGION: "us-east-1"
          AWS_ACCESS_KEY_ID: ${{secrets.RUNNER_ACCESS_KEY_ID}}
          AWS_SECRET_ACCESS_KEY: ${{secrets.RUNNER_ACCESS_KEY_SECRET}}
          AWS_ACCOUNT: ${{secrets.AWS_ACCOUNT}}
        with:
          token: ${{secrets.SELF_HOSTED_RUNNER_TOKEN}}
          region: ${{env.AWS_DEFAULT_REGION}}
          action: stop
          label: ${{needs.start-self-hosted-runners.outputs.label}}
          runners: ${{needs.start-self-hosted-runners.outputs.started}}
```

## How to Contribute

> First, you'll need to have a reasonably modern version of `node` handy. This won't work with versions older than 9, for instance.

Install the dependencies  
```bash
$ npm install
```

Build the typescript and package it for distribution
```bash
$ npm run build && npm run package
```

Run the tests :heavy_check_mark:  
```bash
$ npm test

 PASS  ./index.test.js
  ✓ throws invalid number (3ms)
  ✓ wait 500 ms (504ms)
  ✓ test runs (95ms)

...
```

## Change action.yml

The action.yml contains defines the inputs and output for your action.

Update the action.yml with your name, description, inputs and outputs for your action.

See the [documentation](https://help.github.com/en/articles/metadata-syntax-for-github-actions)

## Change the Code

Most toolkit and CI/CD operations involve async operations so the action is run in an async function.

```javascript
import * as core from '@actions/core';
...

async function run() {
  try { 
      ...
  } 
  catch (error) {
    core.setFailed(error.message);
  }
}

run()
```

See the [toolkit documentation](https://github.com/actions/toolkit/blob/master/README.md#packages) for the various packages.

## Publish to a Distribution Branch

Actions are run from GitHub repos so we will checkin the packed dist folder. 

```bash
$ npm run all
$ git add -A
$ git commit -m "your commit message"
$ git tag v[version from package.json]
$ git push origin v[version from package.json]
```

Your action is now published! :rocket: 

See the [versioning documentation](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)
