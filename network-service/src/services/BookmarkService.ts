import { prisma } from '@/lib/prisma';
import { PostResponse } from '@/types';
import { PostService } from './PostService';

export class BookmarkService {
  private postService = new PostService();

  async bookmarkPost(postId: string, userId: string) {
    // Verify post exists
    await prisma.post.findUniqueOrThrow({
      where: { id: postId }
    });

    // Check if already bookmarked
    const existingBookmark = await prisma.postBookmark.findUnique({
      where: {
        postId_userId: { postId, userId }
      }
    });

    let bookmarked: boolean;

    if (existingBookmark) {
      // Remove bookmark
      await prisma.postBookmark.delete({
        where: {
          postId_userId: { postId, userId }
        }
      });
      bookmarked = false;
    } else {
      // Add bookmark
      await prisma.postBookmark.create({
        data: { postId, userId }
      });
      bookmarked = true;
    }

    return { bookmarked };
  }

  async getUserBookmarks(userId: string, cursor?: string, limit: number = 20) {
    let whereClause: any = { userId };

    if (cursor) {
      whereClause.id = { lt: cursor };
    }

    const bookmarks = await prisma.postBookmark.findMany({
      where: whereClause,
      include: {
        post: {
          include: {
            media: {
              include: {
                media: true
              },
              orderBy: { order: 'asc' }
            },
            tags: true,
            links: {
              orderBy: { order: 'asc' }
            },
            likes: {
              where: { userId }
            },
            bookmarks: {
              where: { userId }
            }
          }
        }
      },
      orderBy: { bookmarkedAt: 'desc' },
      take: limit
    });

    const transformedPosts = bookmarks.map(bookmark => 
      this.postService['transformPost'](bookmark.post, userId)
    );

    return {
      items: transformedPosts,
      nextCursor: bookmarks.length === limit ? bookmarks[bookmarks.length - 1].id : null,
      hasMore: bookmarks.length === limit
    };
  }

  async removeBookmark(postId: string, userId: string) {
    await prisma.postBookmark.delete({
      where: {
        postId_userId: { postId, userId }
      }
    });

    return { removed: true };
  }
}
