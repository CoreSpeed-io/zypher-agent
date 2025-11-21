/**
 * Subscription Management System
 *
 * This module manages user subscriptions for research topics and authors,
 * using Deno KV for persistent storage.
 */

/**
 * Subscription type
 */
export type SubscriptionType = "topic" | "author" | "keyword";

/**
 * Data source for searching
 */
export type DataSource = "arxiv" | "pubmed" | "semantic_scholar" | "all";

/**
 * Subscription configuration
 */
export interface Subscription {
  id: string;
  type: SubscriptionType;
  query: string; // Topic keywords, author name, or search keywords
  email: string;
  dataSources: DataSource[];
  frequency: "daily" | "weekly" | "monthly";
  maxResults: number;
  fieldsOfStudy?: string[]; // For Semantic Scholar filtering
  active: boolean;
  createdAt: Date;
  lastSent?: Date;
}

/**
 * Subscription manager using Deno KV
 */
export class SubscriptionManager {
  private kv: Deno.Kv;

  private constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  /**
   * Create a new subscription manager instance
   */
  static async create(kvPath?: string): Promise<SubscriptionManager> {
    const kv = await Deno.openKv(kvPath);
    return new SubscriptionManager(kv);
  }

  /**
   * Add a new subscription
   */
  async addSubscription(
    subscription: Omit<Subscription, "id" | "createdAt">,
  ): Promise<Subscription> {
    const id = crypto.randomUUID();
    const fullSubscription: Subscription = {
      ...subscription,
      id,
      createdAt: new Date(),
    };

    await this.kv.set(
      ["subscriptions", id],
      fullSubscription,
    );

    // Also index by email for easy lookup
    await this.kv.set(
      ["subscriptions_by_email", subscription.email, id],
      true,
    );

    console.log(`Subscription created: ${id}`);
    return fullSubscription;
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(id: string): Promise<Subscription | null> {
    const result = await this.kv.get<Subscription>(["subscriptions", id]);
    return result.value;
  }

  /**
   * Get all subscriptions for an email
   */
  async getSubscriptionsByEmail(email: string): Promise<Subscription[]> {
    const subscriptions: Subscription[] = [];

    // List all subscription IDs for this email
    const entries = this.kv.list<boolean>({
      prefix: ["subscriptions_by_email", email],
    });

    for await (const entry of entries) {
      const id = entry.key[2] as string; // Extract subscription ID
      const subscription = await this.getSubscription(id);
      if (subscription) {
        subscriptions.push(subscription);
      }
    }

    return subscriptions;
  }

  /**
   * Get all active subscriptions
   */
  async getAllActiveSubscriptions(): Promise<Subscription[]> {
    const subscriptions: Subscription[] = [];

    const entries = this.kv.list<Subscription>({
      prefix: ["subscriptions"],
    });

    for await (const entry of entries) {
      if (entry.value.active) {
        subscriptions.push(entry.value);
      }
    }

    return subscriptions;
  }

  /**
   * Get subscriptions that need to be sent
   */
  async getSubscriptionsDueForSending(): Promise<Subscription[]> {
    const allActive = await this.getAllActiveSubscriptions();
    const now = new Date();

    return allActive.filter((sub) => {
      if (!sub.lastSent) return true; // Never sent before

      const hoursSinceLastSent =
        (now.getTime() - new Date(sub.lastSent).getTime()) / (1000 * 60 * 60);

      switch (sub.frequency) {
        case "daily":
          return hoursSinceLastSent >= 24;
        case "weekly":
          return hoursSinceLastSent >= 24 * 7;
        case "monthly":
          return hoursSinceLastSent >= 24 * 30;
        default:
          return false;
      }
    });
  }

  /**
   * Update subscription's last sent time
   */
  async markSubscriptionSent(id: string): Promise<void> {
    const subscription = await this.getSubscription(id);
    if (!subscription) {
      throw new Error(`Subscription ${id} not found`);
    }

    subscription.lastSent = new Date();
    await this.kv.set(["subscriptions", id], subscription);
  }

  /**
   * Update subscription
   */
  async updateSubscription(
    id: string,
    updates: Partial<Omit<Subscription, "id" | "createdAt">>,
  ): Promise<Subscription | null> {
    const subscription = await this.getSubscription(id);
    if (!subscription) {
      return null;
    }

    const updated = {
      ...subscription,
      ...updates,
    };

    await this.kv.set(["subscriptions", id], updated);
    return updated;
  }

  /**
   * Delete subscription
   */
  async deleteSubscription(id: string): Promise<boolean> {
    const subscription = await this.getSubscription(id);
    if (!subscription) {
      return false;
    }

    // Delete main entry
    await this.kv.delete(["subscriptions", id]);

    // Delete email index
    await this.kv.delete(["subscriptions_by_email", subscription.email, id]);

    console.log(`Subscription deleted: ${id}`);
    return true;
  }

  /**
   * Close the KV connection
   */
  close(): void {
    this.kv.close();
  }

  /**
   * Export subscription as JSON
   */
  exportSubscription(subscription: Subscription): string {
    return JSON.stringify(subscription, null, 2);
  }

  /**
   * Get subscription statistics
   */
  async getStatistics(): Promise<{
    total: number;
    active: number;
    byType: Record<SubscriptionType, number>;
    byFrequency: Record<string, number>;
  }> {
    const all = await this.getAllActiveSubscriptions();

    const stats = {
      total: all.length,
      active: all.filter((s) => s.active).length,
      byType: {
        topic: 0,
        author: 0,
        keyword: 0,
      } as Record<SubscriptionType, number>,
      byFrequency: {
        daily: 0,
        weekly: 0,
        monthly: 0,
      },
    };

    all.forEach((sub) => {
      stats.byType[sub.type]++;
      stats.byFrequency[sub.frequency]++;
    });

    return stats;
  }
}
