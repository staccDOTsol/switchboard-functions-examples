import type { SwitchboardProgram } from "@switchboard-xyz/near.js";
import { SwitchboardRoutine } from "@switchboard-xyz/node";
import { PagerDuty } from "@switchboard-xyz/node/alerts/pager-duty";
import { NodeLogger } from "@switchboard-xyz/node/logging";

export class BalanceWatcherRoutine extends SwitchboardRoutine {
  eventName = "BalanceWatcher";

  errorHandler = async (error) => {
    NodeLogger.getInstance().error(`Failed to fetch balance, ${error}`);
  };
  successHandler = undefined;
  retryInterval = 0;

  constructor(readonly program: SwitchboardProgram) {
    super(120 * 1000);
  }

  routine = async () => {
    const accountBalance = await this.program.account.getAccountBalance();
    //24 == near exponent
    if (accountBalance.available.length < 24) {
      PagerDuty.getInstance().sendEvent(
        "critical",
        `Near payer balance critically low, available balance less than 1`,
        {
          payerKey: this.program.account.accountId,
        }
      );
    } else {
      //preserve 2 decimal places of near balance
      const balance =
        Number.parseFloat(
          accountBalance.available.substring(
            0,
            accountBalance.available.length - 22
          )
        ) / 100;
      NodeLogger.getInstance().debug(`PAYER_BALANCE: ${balance}`);

      // TODO: Send alert if balance is below threshold, 10 NEAR?
      if (balance < 50) {
        const severity =
          balance < 10 ? "critical" : balance < 25 ? "warning" : "info";
        PagerDuty.getInstance().sendEvent(
          severity,
          `Near payer balance low, available balance: ${balance}`,
          {
            payerKey: this.program.account.accountId,
          }
        );
      }
    }
  };
}
