export type Severity = "critical" | "error" | "warning" | "info";

export interface INodePager {
  sendEvent(
    severity: Severity,
    summary: string,
    customDetails: Record<string, any>
  ): Promise<void>;
}
