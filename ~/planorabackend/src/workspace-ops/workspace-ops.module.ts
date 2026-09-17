import {Module} from '@nestjs/common';import {WorkspaceOpsController} from './workspace-ops.controller.js';import {WorkspaceOpsService} from './workspace-ops.service.js';
@Module({controllers:[WorkspaceOpsController],providers:[WorkspaceOpsService]}) export class WorkspaceOpsModule{}
