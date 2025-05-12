import send from "send";

export default send;

declare module "send" {
  interface SendOptions {
    /** A prefix to send before the file content, for an index or regular file. */
    prefix?: Buffer;
    /** A suffix to send after the file content, for an index or regular file. */
    suffix?: Buffer;
  }
}