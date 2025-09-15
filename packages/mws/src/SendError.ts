export abstract class SendError
  <ReasonStr extends keyof ReasonSendErrorMap>
  extends Error {
  constructor({ details, status, reason }:
    {
      details: ReasonSendErrorMap[ReasonStr]["details"]
      status: ReasonSendErrorMap[ReasonStr]["status"]
      reason: ReasonStr

    }) {
    super()
    this.status = status
    this.reason = reason
    this.details = details
    this.name = SendError.name
  }

  status
  reason
  details: ReasonSendErrorMap[ReasonStr]["details"]

  override get message() {
    return JSON.stringify({
      status: this.status,
      reason: this.reason,
      details: this.details
    })
  }

}



// TODO: Make it a type error to break this interface.
export interface ReasonSendErrorMap {
  "RECIPE_NOT_FOUND": {
    err: RecipeNotFound
    details: { recipeName: string }
    status: 404
  }
  "RECIPE_NO_READ_PERMISSION": {
    err: RecipeNoReadPermission
    details: { recipeName: string }
    status: 403
  }
  "RECIPE_NO_WRITE_PERMISSION": {
    err: RecipeNoWritePermission
    details: { recipeName: string }
    status: 403
  }
  "RECIPE_MUST_HAVE_BAGS": {
    err: RecipeMustHaveBags
    details: { recipeName: string }
    status: 403
  }
  "RECIPE_NO_BAG_AT_POSITION_ZERO": {
    err: RecipeNoBagAtPositionZero
    details: { recipeName: string }
    status: 403
  }
  "BAG_NOT_FOUND": {
    err: BagNotFound
    details: { bagName: string }
    status: 404
  }
  "BAG_NO_READ_PERMISSION": {
    err: BagNoReadPermission
    details: { bagName: string }
    status: 403
  }
  "BAG_NO_WRITE_PERMISSION": {
    err: BagNoWritePermission
    details: { bagName: string }
    status: 403
  }
  "BAG_DOES_NOT_HAVE_THIS_TIDDLER": {
    err: BagDoesNotHaveThisTiddler
    details: { bagName: string, tiddlerTitle: string }
    status: 403
  }
  "PAGE_NOT_AUTHORIZED_FOR_ENDPOINT": {
    err: PageNotAuthorizedForEndpoint
    details: undefined
    status: 403
  }
  "RESPONSE_INTERCEPTED_BY_CHECKER": {
    err: ResponseInterceptedByChecker
    details: undefined
    status: 403
  }
  "TIDDLER_WIRE_FORMAT_UNKNOWN": {
    err: TiddlerWireFormatUnknown
    details: { contentType: string }
    status: 403
  }
  "SETTING_KEY_INVALID": {
    err: SettingKeyInvalid
    details: { key: string }
    status: 403
  }
  "LAST_EVENT_ID_NOT_PROVIDED": {
    err: LastEventIdNotProvided
    details: undefined
    status: 403
  }

}

export type xReason = keyof ReasonSendErrorMap

//#region recipe
export class RecipeNotFound extends SendError<"RECIPE_NOT_FOUND"> {
  constructor(recipeName: string) {
    super({
      details: { recipeName },
      status: 404,
      reason: "RECIPE_NOT_FOUND"
    })
  }
}

export class RecipeNoReadPermission extends SendError<"RECIPE_NO_READ_PERMISSION"> {
  constructor(recipeName: string) {
    super({
      details: { recipeName },
      status: 403,
      reason: "RECIPE_NO_READ_PERMISSION"
    })
  }
}

export class RecipeNoWritePermission extends SendError<"RECIPE_NO_WRITE_PERMISSION"> {
  constructor(recipeName: string) {
    super({
      details: { recipeName },
      status: 403,
      reason: "RECIPE_NO_WRITE_PERMISSION"
    })
  }
}

export class RecipeMustHaveBags extends SendError<"RECIPE_MUST_HAVE_BAGS"> {
  constructor(recipeName: string) {
    super({
      details: { recipeName },
      status: 403,
      reason: "RECIPE_MUST_HAVE_BAGS"
    })
  }
}

export class RecipeNoBagAtPositionZero extends SendError<"RECIPE_NO_BAG_AT_POSITION_ZERO"> {
  constructor(recipeName: string) {
    super({
      details: { recipeName },
      status: 403,
      reason: "RECIPE_NO_BAG_AT_POSITION_ZERO"
    })
  }
}
//#endregion recipe

//#region bag
export class BagNotFound extends SendError<"BAG_NOT_FOUND"> {
  constructor(bagName: string) {
    super({
      details: { bagName },
      status: 404,
      reason: "BAG_NOT_FOUND"
    })
  }
}

export class BagNoReadPermission extends SendError<"BAG_NO_READ_PERMISSION"> {
  constructor(bagName: string) {
    super({
      details: { bagName },
      status: 403,
      reason: "BAG_NO_READ_PERMISSION"
    })
  }
}

export class BagNoWritePermission extends SendError<"BAG_NO_WRITE_PERMISSION"> {
  constructor(bagName: string) {
    super({
      details: { bagName },
      status: 403,
      reason: "BAG_NO_WRITE_PERMISSION"
    })
  }
}
//#endregion bag

export class PageNotAuthorizedForEndpoint extends SendError<"PAGE_NOT_AUTHORIZED_FOR_ENDPOINT"> {
  constructor() {
    super({
      details: undefined,
      status: 403,
      reason: "PAGE_NOT_AUTHORIZED_FOR_ENDPOINT"
    })
  }
}

export class ResponseInterceptedByChecker extends SendError<"RESPONSE_INTERCEPTED_BY_CHECKER"> {
  constructor() {
    super({
      details: undefined,
      status: 403,
      reason: "RESPONSE_INTERCEPTED_BY_CHECKER"
    })
  }
}

export class TiddlerWireFormatUnknown extends SendError<"TIDDLER_WIRE_FORMAT_UNKNOWN"> {
  constructor(contentType: string) {
    super({
      details: { contentType },
      status: 403,
      reason: "TIDDLER_WIRE_FORMAT_UNKNOWN"
    })
  }
}

export class SettingKeyInvalid extends SendError<"SETTING_KEY_INVALID"> {
  constructor(key: string) {
    super({
      details: { key },
      status: 403,
      reason: "SETTING_KEY_INVALID"
    })
  }
}

export class BagDoesNotHaveThisTiddler extends SendError<"BAG_DOES_NOT_HAVE_THIS_TIDDLER"> {
  constructor(details: { bagName: string, tiddlerTitle: string }) {
    super({
      details,
      status: 403,
      reason: "BAG_DOES_NOT_HAVE_THIS_TIDDLER"
    })
  }
}

export class LastEventIdNotProvided extends SendError<"LAST_EVENT_ID_NOT_PROVIDED"> {
  constructor() {
    super({
      details: undefined,
      status: 403,
      reason: "LAST_EVENT_ID_NOT_PROVIDED"
    })
  }
}