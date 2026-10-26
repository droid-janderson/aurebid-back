import { auctionSocket } from "./socket.server";

export const AuctionEvents = {
  NEW_BID: "bid:new",
  STATUS_CHANGE: "auction:status_change",
  ENDED: "auction:ended",
  TIMER: "auction:timer",
  STATE: "auction:state",
  ERROR: "error",
} as const;

export const ClientEvents = {
  JOIN_AUCTION: "auction:join",
  LEAVE_AUCTION: "auction:leave",
  PLACE_BID: "bid:place",
} as const;

export { auctionSocket };
