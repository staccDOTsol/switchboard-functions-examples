import config from "../config/config.js";

import docsRoute from "./docs.route.js";
import simulateRoute from "./simulate.route.js";
import taskRoute from "./task.route.js";
import testRoute from "./test.route.js";

import type { Router } from "express";
import express from "express";

const router: Router = express.Router();

interface RouteInfo {
  path: string;
  route: Router;
}

const defaultRoutes: Array<RouteInfo> = [
  {
    path: "/task",
    route: taskRoute,
  },
  {
    path: "/simulate",
    route: simulateRoute,
  },
  {
    path: "/docs",
    route: docsRoute,
  },
];

// routes available only in development mode
const devRoutes: Array<RouteInfo> = [{ path: "/test", route: testRoute }];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === "development") {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

export default router;
