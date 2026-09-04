export {
  FPC_CONFIG,
  FPC_CONFIG_VERSION,
  FPC_GAME_ID,
  FPC_SYMBOL_META,
  type FpcReceiptView,
  type FpcSelection,
  type FpcServerResult,
} from "./config";
export {
  assertConfigAligned,
  buildFpcSelection,
  formatGik,
  loadFpcSession,
  newIdempotencyKey,
  parseFpcServerResult,
  parsePlaceBetPayload,
  parseReplayReceipt,
  resolveGraphicsMode,
  saveFpcSession,
  supportsWebGl,
  totalReturnLabel,
} from "./session";
