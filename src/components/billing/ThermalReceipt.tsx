"use client";

import type { ReactNode } from "react";

type ReceiptBill = {
  billNumber: string; billingDate: string; subtotal: string; discountAmount: string; taxAmount: string; serviceCharges: string; deliveryCharges: string; grandTotal: string;
  order: { orderNumber: string; customerName: string | null; table: { name: string } | null; items: { id: number; nameSnapshot: string; quantity: number; price: string }[] };
  payments?: { id: number; method: string; amount: string; reference: string | null }[];
};

type Props = {
  bill: ReceiptBill;
  settings: { receiptHeader?: string | null; receiptFooter?: string | null; printLogo?: boolean; restaurant?: { name?: string | null; phone?: string | null; address?: string | null; logo?: string | null } | null };
  money: (value: string | number) => string;
};

function Row({ left, right, strong = false }: { left: ReactNode; right: ReactNode; strong?: boolean }) {
  return <div className={`receipt-row ${strong ? "receipt-strong" : ""}`}><span>{left}</span><span>{right}</span></div>;
}

export function ThermalReceipt({ bill, settings, money }: Props) {
  const paid = bill.payments?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
  return <section id="thermal-receipt" aria-label="Printable thermal receipt">
    {settings.printLogo && settings.restaurant?.logo ? <img className="receipt-logo" src={settings.restaurant.logo} alt="Restaurant logo" /> : null}
    <h1>{settings.restaurant?.name || "Restaurant"}</h1>
    {settings.restaurant?.address ? <p>{settings.restaurant.address}</p> : null}
    {settings.restaurant?.phone ? <p>{settings.restaurant.phone}</p> : null}
    {settings.receiptHeader ? <p className="receipt-note">{settings.receiptHeader}</p> : null}
    <div className="receipt-rule" />
    <Row left={`Invoice #${bill.billNumber}`} right={new Date(bill.billingDate).toLocaleDateString()} />
    <Row left={`Order #${bill.order.orderNumber}`} right={bill.order.table?.name || "Takeaway"} />
    <Row left="Customer" right={bill.order.customerName || "Guest"} />
    <div className="receipt-rule" />
    {bill.order.items.map((item) => <div key={item.id} className="receipt-item"><div>{item.quantity} × {item.nameSnapshot}</div><div>{money(Number(item.price) * item.quantity)}</div></div>)}
    <div className="receipt-rule" />
    <Row left="Subtotal" right={money(bill.subtotal)} />
    {Number(bill.discountAmount) > 0 ? <Row left="Discount" right={`-${money(bill.discountAmount)}`} /> : null}
    <Row left="Tax" right={money(bill.taxAmount)} />
    {(Number(bill.serviceCharges) + Number(bill.deliveryCharges)) > 0 ? <Row left="Service / delivery" right={money(Number(bill.serviceCharges) + Number(bill.deliveryCharges))} /> : null}
    <Row left="TOTAL" right={money(bill.grandTotal)} strong />
    {bill.payments?.length ? <><div className="receipt-rule" />{bill.payments.map((payment) => <Row key={payment.id} left={payment.method.replaceAll("_", " ")} right={money(payment.amount)} />)}<Row left="Paid" right={money(paid)} /></> : null}
    <div className="receipt-rule" />
    <p className="receipt-footer">{settings.receiptFooter || "Thank you for dining with us."}</p>
  </section>;
}
