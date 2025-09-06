import { prisma } from '@/lib/prisma';
import { FastifyRequest } from 'fastify';
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import path from 'path';

const pump = promisify(pipeline);

export class MediaService {
  private uploadDir = process.env.UPLOAD_DIR || './uploads';
  private maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB
  private allowedMimeTypes = (process.env.ALLOWED_MIME_TYPES || 'image/jpeg,image/png,image/webp,video/mp4').split(',');

  constructor() {
    // Ensure upload directory exists
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadAndCreateMedia(request: FastifyRequest, userId: string): Promise<any> {
    const fileData = await this.parseMultipartFile(request);
    
    if (!fileData) {
      throw new Error('No file uploaded');
    }

    // Validate file size
    if (fileData.content.length > this.maxFileSize) {
      throw new Error(`File too large. Maximum size is ${this.maxFileSize} bytes`);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = path.extname(fileData.filename || '');
    const filename = `${timestamp}-${Math.random().toString(36).substr(2, 9)}${extension}`;
    const filepath = path.join(this.uploadDir, filename);

    // Save file
    writeFileSync(filepath, fileData.content);

    // Get file stats
    const stats = await this.getImageDimensions(filepath, fileData.mimeType);

    // Generate full URL for media
    const baseUrl = process.env.BASE_URL || 'http://localhost:4005';
    const fullUrl = `${baseUrl}/uploads/${filename}`;

    // Create media record
    const media = await prisma.media.create({
      data: {
        url: fullUrl,
        mimeType: fileData.mimeType,
        sizeBytes: fileData.content.length,
        width: stats?.width,
        height: stats?.height,
        storageKey: filename,
        ownerUserId: userId
      }
    });

    console.log(`MediaService: Created media record with ID: ${media.id}, URL: ${media.url}`);

    return media;
  }

  async uploadFile(request: FastifyRequest): Promise<{ id: string; url: string; mimeType: string; width?: number; height?: number }> {
    const fileData = await this.parseMultipartFile(request);
    
    if (!fileData) {
      throw new Error('No file uploaded');
    }

    // Validate file size
    if (fileData.content.length > this.maxFileSize) {
      throw new Error(`File too large. Maximum size is ${this.maxFileSize} bytes`);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = path.extname(fileData.filename || '');
    const filename = `${timestamp}-${Math.random().toString(36).substr(2, 9)}${extension}`;
    const filepath = path.join(this.uploadDir, filename);

    // Save file
    writeFileSync(filepath, fileData.content);

    // Get file stats
    const stats = await this.getImageDimensions(filepath, fileData.mimeType);

    // Generate full URL for media
    const baseUrl = process.env.BASE_URL || 'http://localhost:4005';
    const fullUrl = `${baseUrl}/uploads/${filename}`;

    // Create media record
    const media = await prisma.media.create({
      data: {
        url: fullUrl,
        mimeType: fileData.mimeType,
        sizeBytes: fileData.content.length,
        width: stats?.width,
        height: stats?.height,
        storageKey: filename,
        ownerUserId: request.user?.sub || 'anonymous'
      }
    });

    console.log(`MediaService: Created media record with ID: ${media.id}, URL: ${media.url}`);

    return {
      id: media.id,
      url: media.url,
      mimeType: media.mimeType,
      width: media.width || undefined,
      height: media.height || undefined
    };
  }

  private async parseMultipartFile(request: FastifyRequest): Promise<{
    filename: string;
    mimeType: string;
    content: Buffer;
  } | null> {
    const contentType = request.headers['content-type'];
    
    if (!contentType || !contentType.includes('multipart/form-data')) {
      throw new Error('Content-Type must be multipart/form-data');
    }

    // Extract boundary from content-type header
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
      throw new Error('No boundary found in multipart data');
    }
    
    const boundary = boundaryMatch[1];
    const rawBody = request.body as Buffer;
    
    if (!rawBody || rawBody.length === 0) {
      return null;
    }

    // Parse multipart data
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    const parts = this.splitBuffer(rawBody, boundaryBuffer);
    
    for (const part of parts) {
      if (part.length === 0) continue;
      
      // Find double CRLF that separates headers from content
      const headerEndIndex = part.indexOf('\r\n\r\n');
      if (headerEndIndex === -1) continue;
      
      const headerSection = part.slice(0, headerEndIndex).toString();
      const contentSection = part.slice(headerEndIndex + 4);
      
      // Check if this part contains a file
      if (headerSection.includes('Content-Disposition: form-data') && headerSection.includes('filename=')) {
        // Extract filename
        const filenameMatch = headerSection.match(/filename="([^"]+)"/);
        const filename = filenameMatch ? filenameMatch[1] : 'unknown';
        
        // Extract content type
        const contentTypeMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/);
        const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
        
        return {
          filename,
          mimeType,
          content: contentSection
        };
      }
    }
    
    return null;
  }

  private splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
    const parts: Buffer[] = [];
    let start = 0;
    let index = 0;
    
    while (index < buffer.length) {
      index = buffer.indexOf(delimiter, start);
      if (index === -1) {
        // Add remaining part if any
        if (start < buffer.length) {
          parts.push(buffer.slice(start));
        }
        break;
      }
      
      if (index > start) {
        parts.push(buffer.slice(start, index));
      }
      
      start = index + delimiter.length;
    }
    
    return parts;
  }

  async createMediaRecord(data: {
    url: string;
    mimeType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    storageKey: string;
    ownerUserId: string;
  }) {
    const media = await prisma.media.create({
      data
    });

    return {
      id: media.id,
      url: media.url,
      mimeType: media.mimeType,
      width: media.width || undefined,
      height: media.height || undefined
    };
  }

  async getPostMedia(postId: string) {
    const postMedia = await prisma.postMedia.findMany({
      where: { postId },
      include: {
        media: true
      },
      orderBy: { order: 'asc' }
    });

    return {
      media: postMedia.map(pm => ({
        id: pm.media.id,
        url: pm.media.url,
        mimeType: pm.media.mimeType,
        width: pm.media.width || undefined,
        height: pm.media.height || undefined
      }))
    };
  }

  async associateMediaWithPost(postId: string, mediaIds: string[]) {
    console.log(`MediaService: Associating media ${mediaIds} with post ${postId}`);
    
    // Verify post exists
    const post = await prisma.post.findUnique({
      where: { id: postId }
    });
    
    if (!post) {
      throw new Error(`Post ${postId} not found`);
    }
    
    // Verify media exists
    const existingMedia = await prisma.media.findMany({
      where: { id: { in: mediaIds } }
    });
    
    console.log(`MediaService: Found ${existingMedia.length} existing media records`);
    
    if (existingMedia.length === 0) {
      throw new Error('No valid media IDs provided');
    }
    
    // Create PostMedia junction records
    const associations = await prisma.postMedia.createMany({
      data: existingMedia.map((media, index) => ({
        postId,
        mediaId: media.id,
        order: index
      })),
      skipDuplicates: true
    });

    console.log(`MediaService: Created ${associations.count} PostMedia associations`);

    return {
      success: true,
      associationsCreated: associations.count,
      mediaIds: existingMedia.map(m => m.id)
    };
  }

  private async getImageDimensions(filepath: string, mimeType: string): Promise<{ width: number; height: number } | null> {
    // For now, return null - you could add image processing library like sharp here
    // This would require adding sharp as a dependency
    if (mimeType.startsWith('image/')) {
      try {
        // Placeholder - would use sharp or similar:
        // const sharp = require('sharp');
        // const metadata = await sharp(filepath).metadata();
        // return { width: metadata.width, height: metadata.height };
        return null;
      } catch {
        return null;
      }
    }
    return null;
  }
}
