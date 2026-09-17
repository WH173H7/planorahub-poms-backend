import {TaskWorkflowEditor} from '@/components/workspace/task-workflow-editor';
export default async function Page({params}:{params:Promise<{workflowId:string}>}){const {workflowId}=await params;return <TaskWorkflowEditor workflowId={workflowId}/>}
