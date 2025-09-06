import { prisma } from '@/lib/prisma';
import { CommentResponse } from '@/types';
import { JWTPayload } from '@/middleware/auth';
import { canModifyContent } from '@/middleware/auth';

export class CommentService {
  async createComment(postId: string, content: string, user: JWTPayload): Promise<CommentResponse> {
    // Verify post exists
    await prisma.post.findUniqueOrThrow({
      where: { id: postId }
    });

    const comment = await prisma.postComment.create({
      data: {
        postId,
        userId: user.sub,
        content: content.trim(),
        userDisplayName: user.displayName || user.name || 'Unknown User',
        userAvatarUrl: user.avatarUrl
      }
    });

    // Increment comment count
    await prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } }
    });

    return this.transformComment(comment);
  }

  async getComments(postId: string, cursor?: string, limit: number = 20) {
    let whereClause: any = { postId };

    if (cursor) {
      whereClause.id = { lt: cursor };
    }

    const comments = await prisma.postComment.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    return {
      items: comments.map(comment => this.transformComment(comment)),
      nextCursor: comments.length === limit ? comments[comments.length - 1].id : null,
      hasMore: comments.length === limit
    };
  }

  async updateComment(commentId: string, content: string, user: JWTPayload): Promise<CommentResponse> {
    const comment = await prisma.postComment.findUniqueOrThrow({
      where: { id: commentId }
    });

    if (!canModifyContent(user.sub, comment.userId, user.role || 'STUDENT')) {
      throw new Error('Unauthorized to modify this comment');
    }

    const updatedComment = await prisma.postComment.update({
      where: { id: commentId },
      data: { content: content.trim() }
    });

    return this.transformComment(updatedComment);
  }

  async deleteComment(commentId: string, user: JWTPayload): Promise<{ deleted: boolean }> {
    const comment = await prisma.postComment.findUniqueOrThrow({
      where: { id: commentId }
    });

    if (!canModifyContent(user.sub, comment.userId, user.role || 'STUDENT')) {
      throw new Error('Unauthorized to delete this comment');
    }

    await prisma.postComment.delete({
      where: { id: commentId }
    });

    // Decrement comment count
    await prisma.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } }
    });

    return { deleted: true };
  }

  private transformComment(comment: any): CommentResponse {
    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      userId: comment.userId,
      userDisplayName: comment.userDisplayName,
      userAvatarUrl: comment.userAvatarUrl
    };
  }
}
