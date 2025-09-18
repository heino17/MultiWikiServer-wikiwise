
export interface SendErrorItem<STATUS extends number, DETAIL extends (object & {}) | null> {
  status: STATUS;
  details: DETAIL;
}

export interface SendErrorReasonData {
  "RECIPE_NOT_FOUND":
  SendErrorItem<404, { recipeName: string }>;

  "RECIPE_NO_READ_PERMISSION":
  SendErrorItem<403, { recipeName: string }>;

  "RECIPE_NO_WRITE_PERMISSION":
  SendErrorItem<403, { recipeName: string }>;

  "RECIPE_MUST_HAVE_BAGS":
  SendErrorItem<400, { recipeName: string }>;

  "RECIPE_NO_BAG_AT_POSITION_ZERO":
  SendErrorItem<403, { recipeName: string }>;

  "BAG_NOT_FOUND":
  SendErrorItem<404, { bagName: string }>;

  "BAG_NO_READ_PERMISSION":
  SendErrorItem<403, { bagName: string }>;

  "BAG_NO_WRITE_PERMISSION":
  SendErrorItem<403, { bagName: string }>;

  "BAG_DOES_NOT_HAVE_THIS_TIDDLER":
  SendErrorItem<403, { bagName: string, tiddlerTitle: string }>;

  "PAGE_NOT_AUTHORIZED_FOR_ENDPOINT":
  SendErrorItem<403, null>;

  "RESPONSE_INTERCEPTED_BY_CHECKER":
  SendErrorItem<500, null>;

  "TIDDLER_WIRE_FORMAT_UNKNOWN":
  SendErrorItem<403, { contentType: string }>;

  "SETTING_KEY_INVALID":
  SendErrorItem<403, { key: string }>;

  "LAST_EVENT_ID_NOT_PROVIDED":
  SendErrorItem<403, null>;

  "UNKNOWN_ERROR_FROM_CLIENT":
  SendErrorItem<400, any>;

  /** Check the server logs for this one */
  "INTERNAL_SERVER_ERROR":
  SendErrorItem<500, { message: string; details?: any; }>;
};

export class SendError<REASON extends SendErrorReason>
  extends Error {

  constructor(
    public reason: REASON,
    public status: SendErrorReasonData[REASON]["status"],
    public details: SendErrorReasonData[REASON]["details"],
  ) {
    super();
    this.name = SendError.name;
  }

  override get message() {
    return JSON.stringify({
      status: this.status,
      reason: this.reason,
      details: this.details
    });
  }

  toJSON() {
    return {
      status: this.status,
      reason: this.reason,
      details: this.details
    };
  }

}

export type SendErrorReason = keyof SendErrorReasonData
