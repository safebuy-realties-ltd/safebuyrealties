import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { DocumentsService } from "./documents.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../auth/jwt.strategy";
import { UploadDocumentMetaDto } from "./dto/upload-document.dto";

@Controller("documents")
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private documents: DocumentsService) {}

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  upload(
    @Body() body: UploadDocumentMetaDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documents.createFromUpload(body.listingId, body.category, file, user);
  }

  @Get("listing/:listingId")
  list(@Param("listingId") listingId: string, @CurrentUser() user: JwtPayload) {
    return this.documents.listByListing(listingId, user);
  }
}
