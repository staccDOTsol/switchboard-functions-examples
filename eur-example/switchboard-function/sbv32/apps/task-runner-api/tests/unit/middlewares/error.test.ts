import config from "../../../src/config/config.js";
import logger from "../../../src/config/logger.js";
import {
  errorConverter,
  errorHandler,
} from "../../../src/middlewares/error.js";
import ApiError from "../../../src/utils/ApiError.js";

import httpStatus from "http-status";
import httpMocks from "node-mocks-http";

describe("Error middlewares", () => {
  describe("Error converter", () => {
    test("should return the same ApiError object it was called with", () => {
      const error = new ApiError(httpStatus.BAD_REQUEST, "Any error");
      const next = jest.fn();

      errorConverter(
        error,
        httpMocks.createRequest(),
        httpMocks.createResponse(),
        next
      );

      expect(next).toHaveBeenCalledWith(error);
    });

    test("should convert an Error to ApiError and preserve its status and message", () => {
      const error = new Error("Any error");
      (error as any).statusCode = httpStatus.BAD_REQUEST;
      const next = jest.fn();

      errorConverter(
        error,
        httpMocks.createRequest(),
        httpMocks.createResponse(),
        next
      );

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: (error as any).statusCode,
          message: error.message,
          isOperational: false,
        })
      );
    });

    test("should convert an Error without status to ApiError with status 500", () => {
      const error = new Error("Any error");
      const next = jest.fn();

      errorConverter(
        error,
        httpMocks.createRequest(),
        httpMocks.createResponse(),
        next
      );

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          message: error.message,
          isOperational: false,
        })
      );
    });

    test("should convert an Error without message to ApiError with default message of that http status", () => {
      const error = new Error();
      (error as any).statusCode = httpStatus.BAD_REQUEST;
      const next = jest.fn();

      errorConverter(
        error,
        httpMocks.createRequest(),
        httpMocks.createResponse(),
        next
      );

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: (error as any).statusCode,
          message: httpStatus[(error as any).statusCode],
          isOperational: false,
        })
      );
    });

    test("should convert any other object to ApiError with status 500 and its message", () => {
      const error = {};
      const next = jest.fn();

      errorConverter(
        error,
        httpMocks.createRequest(),
        httpMocks.createResponse(),
        next
      );

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: httpStatus.INTERNAL_SERVER_ERROR,
          message: httpStatus[httpStatus.INTERNAL_SERVER_ERROR],
          isOperational: false,
        })
      );
    });
  });

  describe("Error handler", () => {
    beforeEach(() => {
      jest.spyOn(logger, "error").mockImplementation((() => {}) as any);
    });

    test("should send proper error response and put the error message in res.locals", () => {
      const error = new ApiError(httpStatus.BAD_REQUEST, "Any error");
      const res = httpMocks.createResponse();
      const sendSpy = jest.spyOn(res, "send");

      errorHandler(error, httpMocks.createRequest(), res);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: error.statusCode,
          message: error.message,
        })
      );
      expect(res.locals.errorMessage).toBe(error.message);
    });

    test("should put the error stack in the response if in development mode", () => {
      config.env = "development";
      const error = new ApiError(httpStatus.BAD_REQUEST, "Any error");
      const res = httpMocks.createResponse();
      const sendSpy = jest.spyOn(res, "send");

      errorHandler(error, httpMocks.createRequest(), res);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: error.statusCode,
          message: error.message,
          stack: error.stack,
        })
      );
      config.env = process.env.NODE_ENV;
    });

    test("should send internal server error status and message if in production mode and error is not operational", () => {
      config.env = "production";
      const error = new ApiError(httpStatus.BAD_REQUEST, "Any error", false);
      const res = httpMocks.createResponse();
      const sendSpy = jest.spyOn(res, "send");

      errorHandler(error, httpMocks.createRequest(), res);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: httpStatus.INTERNAL_SERVER_ERROR,
          message: httpStatus[httpStatus.INTERNAL_SERVER_ERROR],
        })
      );
      expect(res.locals.errorMessage).toBe(error.message);
      config.env = process.env.NODE_ENV;
    });

    test("should preserve original error status and message if in production mode and error is operational", () => {
      config.env = "production";
      const error = new ApiError(httpStatus.BAD_REQUEST, "Any error");
      const res = httpMocks.createResponse();
      const sendSpy = jest.spyOn(res, "send");

      errorHandler(error, httpMocks.createRequest(), res);

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: error.statusCode,
          message: error.message,
        })
      );
      config.env = process.env.NODE_ENV;
    });
  });
});
