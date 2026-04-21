import { NotificationType } from '@prisma/client';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: object;
  link?: string;
}

export class NotificationService {
  async create(input: CreateNotificationInput) {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type as NotificationType,
        title: input.title,
        message: input.message,
        data: input.data,
        link: input.link,
      },
    });

    // Invalidate user notification count cache
    await cache.del(`notifications:count:${input.userId}`);

    return notification;
  }

  async createBulk(inputs: CreateNotificationInput[]) {
    const created = await prisma.notification.createMany({
      data: inputs.map((i) => ({
        userId: i.userId,
        type: i.type as NotificationType,
        title: i.title,
        message: i.message,
        data: i.data,
        link: i.link,
      })),
    });

    // Invalidate caches for all recipients
    const uniqueUserIds = [...new Set(inputs.map((i) => i.userId))];
    await Promise.all(uniqueUserIds.map((id) => cache.del(`notifications:count:${id}`)));

    return created;
  }

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [notifications, total, unreadCount] = await prisma.$transaction([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { notifications, total, unreadCount };
  }

  async markRead(userId: string, notificationIds: string[]) {
    await prisma.notification.updateMany({
      where: { id: { in: notificationIds }, userId },
      data: { isRead: true, readAt: new Date() },
    });
    await cache.del(`notifications:count:${userId}`);
  }

  async markAllRead(userId: string) {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    await cache.del(`notifications:count:${userId}`);
  }

  async getUnreadCount(userId: string): Promise<number> {
    const cacheKey = `notifications:count:${userId}`;
    const cached = await cache.get<number>(cacheKey);
    if (cached !== null) return cached;

    const count = await prisma.notification.count({ where: { userId, isRead: false } });
    await cache.set(cacheKey, count, 60);
    return count;
  }
}
