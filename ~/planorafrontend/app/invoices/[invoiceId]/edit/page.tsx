import { InvoiceEditor } from '@/components/invoices/invoice-editor';
export default async function Page({params}:{params:Promise<{invoiceId:string}>}){const {invoiceId}=await params;return <InvoiceEditor invoiceId={invoiceId}/>}
