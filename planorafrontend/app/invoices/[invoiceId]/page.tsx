import { InvoiceDetail } from '@/components/invoices/invoice-detail';
export default async function Page({params}:{params:Promise<{invoiceId:string}>}){const {invoiceId}=await params;return <InvoiceDetail invoiceId={invoiceId}/>}
