# copybara

[copybara](https://github.com/google/copybara) is a tool to sync code between repositories.

## Setup

There are no MacOS install instructions and instead you need to compile the java \*.jar file.

```bash
brew install bazel
brew install java

# Brew will notify you to run the following command after install java
sudo ln -sfn /opt/homebrew/opt/openjdk/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk.jdk
echo 'export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"' >> ~/.zshrc
```

Then clone the [copybara](https://github.com/google/copybara) repo

```bash
git clone https://github.com/google/copybara
cd copybara
```

Build the bazel project

```bash
bazel build //java/com/google/copybara:copybara_deploy.jar
```

Done!

Add the following to your `~/.zshrc` config so you can invoke copybara with a single command, replacing the path to the location of your copybara repository

```bash
copybara () { /usr/bin/java -jar "$HOME"/dev/copybara/bazel-bin/java/com/google/copybara/copybara_deploy.jar "$@" ; }
```

## Usage

Work in progress!

```bash
# To push changes to sbv2-core
copybara copy.bara.sky sbv2-core-push --force
# To pull changes from sbv2-core
copybara copy.bara.sky sbv2-core-pull --force
```

`--force` should only be needed for empty destination repositories or non-existent branches in the destination.

## More Info

- [copybara Examples](https://github.com/google/copybara/blob/master/docs/examples.md)
- [Moving code between GIT repositories with copybara](https://blog.kubesimplify.com/moving-code-between-git-repositories-with-copybara)
