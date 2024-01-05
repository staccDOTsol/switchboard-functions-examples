# Control Panel

Switchboard control panel and internal documentation

## Table of Contents

- [Kubernetes](./k8s.md)
  - Install Switchboard k8s scripts
  - Set Cluster
  - List Pods
  - View a Pods Logs
  - Restart a Pod
  - Deploy a Cluster
- [CLI](./cli/README.md)
  - Install and link the CLI locally
  - CLI Architecture
  - Creating Custom Commands
  - Adding New Chain Integrations
- [CLI Automation](./cli/automation/README.md)
  - How to use the CLI to batch update multiple data feeds
- [Solana Devops](./solana/devops/README.md)
  - Investigate Network Health
  - Investigate Feed Health
  - Investigate Crank Health
- [NEAR Devops](./near/devops/README.md)
  - Fund sbv2-authority from the contract wallet
  - Add or remove jobs from a feed
- [Starknet Devops](./starknet/devops/README.md)
- [CoreDAO Devops](./coredao/devops/README.md)

- Deploys
  - [Aptos Deploys](./aptos/deploy/README.md)
  - [Arbitrum Deploys](./arbitrum/deploy/README.md)
  - [CoreDAO Deploys](./coredao/deploy/README.md)
  - [NEAR Deploys](./near/deploy/README.md)
  - [Optimism Deploys](./optimism/deploy/README.md)
  - [Solana Deploys](./solana/deploy/README.md)
  - [Sui Deploys](./sui/deploy/README.md)

## TODO

- [ ] **K8s:** add minimum IAM permissions for new users (resource monitoring,
      pod viewer)
- [ ] **K8s:** add k8s instructions and script installation for zsh
- [ ] **Pager:** add devops playbook for common pages
- [ ] **Test:** add test queue setup for aptos, near, solana
- [ ] **Test:** add local oracle/crank instructions
- [ ] **Repos:** add instructions for updating sbv2-core SDKs
- [ ] **Repos:** add instructions for updating and publishing protos
