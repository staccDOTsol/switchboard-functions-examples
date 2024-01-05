import type { IJobContext } from "../types/JobContext.js";
import {
  httpResponseTimeout,
  maxResponseSizeAgent,
  verifyUrl,
} from "../utils/http.js";

import { OracleJob } from "@switchboard-xyz/common";
import { fetch } from "undici";

// import http from "http";
// import https from "https";
// const httpAgent = new http.Agent({ keepAlive: true }); // maybe add timeout and freeSocketTimeout
// const httpsAgent = new https.Agent({ keepAlive: true });

/**
 * Report the text body of a successful HTTP request to the specified url, or return an error if the response status code is greater than or equal to 400
 * @param [ctx] Context for the current execution of the task runner used to provide caching and client interfaces to support job execution.
 * @param [iHttpTask] An HttpTask job to run.
 * @throws {String}
 * @returns {Promise<string>} stringified http response
 */
export async function httpTask(
  ctx: IJobContext,
  iHttpTask: OracleJob.IHttpTask
): Promise<string> {
  if (ctx.cache.hasHttpResponse(iHttpTask)) {
    return ctx.cache.getHttpResponse(iHttpTask)!;
  }

  const parentVars: any = (<any>ctx.configs)["jobVariables"] ?? {};
  const vars = {};
  Object.assign(vars, parentVars["*"] ?? {});
  Object.assign(vars, parentVars[ctx.jobKey] ?? {});

  const rawUrl: string = ctx.variableExpand(iHttpTask.url ?? "", vars);
  const url = verifyUrl(rawUrl ?? "");

  const headers: Record<string, string> = {};
  for (const header of iHttpTask.headers ?? []) {
    headers[header.key ?? ""] = ctx.variableExpand(header.value ?? "", vars);
  }
  const body: string = iHttpTask.body ?? "";

  const isPost = iHttpTask.method === OracleJob.HttpTask.Method.METHOD_POST;

  const response = await fetch(url.toString(), {
    method: isPost ? "POST" : "GET",
    body: isPost ? body : undefined,
    headers: headers,
    dispatcher: maxResponseSizeAgent,
    // compress: true,
    keepalive: true,
    // highWaterMark: 10000,
    signal: AbortSignal.timeout(httpResponseTimeout),
    // agent: (parsedURL: URL) => {
    //   if (parsedURL.protocol === "http:") {
    //     return httpAgent;
    //   } else {
    //     return httpsAgent;
    //   }
    // },
  });
  if (!response.ok) {
    throw new Error(`HttpTask: Error (Status=${response.status}), ${url}`);
  }

  const responseString = await response.text();

  ctx.cache.setHttpResponse(iHttpTask, responseString, {
    ttl: 5 * 1000,
  });

  return responseString;
}
