export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP";

export interface BrokerOrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
}

export interface BrokerOrderResult {
  brokerOrderId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  raw?: unknown;
}

export interface BrokerProvider {
  readonly name: string;
  placeOrder(order: BrokerOrderRequest): Promise<BrokerOrderResult>;
  cancelOrder(brokerOrderId: string): Promise<void>;
  getOrderStatus(brokerOrderId: string): Promise<string>;
}

export interface OrderService {
  submitOrder(order: BrokerOrderRequest): Promise<BrokerOrderResult>;
}

export interface ExecutionEngine {
  validate(order: BrokerOrderRequest): Promise<void>;
  execute(order: BrokerOrderRequest): Promise<BrokerOrderResult>;
}

