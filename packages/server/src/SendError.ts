
export interface SendErrorItem<STATUS extends number, DETAIL extends (object & {}) | null> {
  status: STATUS;
  details: DETAIL;
}

export interface SendErrorReasonData {
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
