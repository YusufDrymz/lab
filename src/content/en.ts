import type { Content } from './types'

export const en: Content = {
  locale: 'en',

  chrome: {
    home: 'lab',
    siteLabel: 'yusufdariyemez.com',
    siteHref: 'https://yusufdariyemez.com',
    repoLabel: 'GitHub',
    otherLocale: 'Türkçe',
    otherLocaleHref: '/tr',
    builtBy: 'Built by',
    sourceOn: 'Source on',
    disclaimer:
      'The simulations are teaching models, not emulators. They reproduce the behaviour each section is about and deliberately leave out the rest.',
    relatedRepo: 'Related repository',
    controls: {
      play: 'Play',
      pause: 'Pause',
      step: 'Step',
      restart: 'Restart',
      speed: 'speed',
    },
    emptyLog: 'nothing has happened yet',
    predictRight: 'Right.',
    predictWrong: 'Not quite.',
  },

  home: {
    title: 'lab',
    tagline: 'Backend systems, explained by their behaviour.',
    intro: [
      {
        html: 'Most explanations of distributed systems show you the architecture — the boxes, the arrows, the happy path. That part is usually the easy part. What actually costs you a night is the behaviour: what happens when a process dies halfway through, when a queue backs up behind one bad message, when two systems disagree about what was written.',
      },
      {
        html: 'These are interactive models of exactly that. You get the controls, including the ones that break things, and the failure is the point rather than an appendix.',
      },
    ],
    principles: [
      {
        title: 'Behaviour, not architecture',
        body: 'Each lab starts where the diagrams stop — at the crash, the stall, the duplicate. If a concept can be understood from a static picture, it is not in here.',
      },
      {
        title: 'Deterministic',
        body: 'Every simulation is seeded. The same run always replays the same incident, so you can pause, step back through it and see the moment you missed.',
      },
      {
        title: 'Nothing to install',
        body: 'No broker, no backend, no account. The models run entirely in your browser, which is also why you can break them as hard as you like.',
      },
    ],
    labsHeading: 'Labs',
    kafkaCard: {
      title: 'Kafka, by behaviour',
      summary:
        'Six sections on what Kafka actually does under failure — starting before the first byte reaches a broker, with the two writes that are not atomic.',
      topics: [
        'Dual writes, outbox and CDC',
        'Key routing and hot partitions',
        'Consumer groups and the parallelism ceiling',
        'Rebalance stalls',
        'At-most-once vs at-least-once',
        'Dead letters and the replay that loops',
      ],
      cta: 'Open the lab',
    },
  },

  kafka: {
    title: 'Kafka, by behaviour',
    intro: [
      {
        html: 'Most Kafka visualisations show you the architecture: producers, brokers, boxes with arrows between them. This one skips that and goes straight to the parts that actually page you at 3am — dual writes, hot partitions, rebalance stalls, offsets committed in the wrong order, and dead letters you cannot safely replay.',
      },
      {
        tone: 'muted',
        html: 'Everything here runs in your browser. There is no broker, no backend and no network call: it is a deterministic model, so the same seed always replays the same incident. Break it as hard as you like.',
      },
    ],
    nav: ['Write path', 'Partitions', 'Groups', 'Rebalance', 'Offsets', 'Dead letters'],

    sections: {
      writePath: {
        title: 'Where does the data come from?',
        lede: 'Every other explanation of Kafka starts with a producer that already exists. The most expensive mistake happens earlier than that.',
        prose: [
          {
            html: 'Kafka is not a database and not a cache. It is an append-only log that your application <em>writes to</em> — which means that on every order you take, two different systems have to be updated: the database that owns the truth, and the log that tells everyone else about it.',
          },
          {
            html: 'Those two writes are not atomic. There is no transaction that spans Postgres and a broker. Crash in the gap and you get one of two broken outcomes, and which one you get depends only on the order you happened to write the code in.',
          },
          {
            tone: 'accent',
            html: 'Worth saying plainly, because it is the most common confusion: <strong>Redis is not the source of this event log.</strong> Redis is a cache, a lock, a short-lived queue. Putting it on this path buys you another system to lose writes in, not durability.',
          },
          {
            html: 'The fix is not to try harder at the two writes. It is to stop having two. With the <strong>outbox</strong> pattern the order row and the event row are written in a single transaction, and a separate relay drains the outbox afterwards — atomicity becomes the database’s problem, which is the one system that is actually good at it. <strong>CDC</strong> goes further: no outbox table, the relay tails Postgres’ WAL and the application never learns that Kafka exists.',
          },
        ],
        predict: {
          question:
            'Dual write: the app commits the order, then dies before publishing. What does the rest of the system see?',
          options: [
            'Nothing — the order rolls back too',
            'An order that exists but was never announced',
            'The event arrives late, once the app restarts',
          ],
          answer: 1,
          explanation:
            'The COMMIT already happened, so the order is real and permanent. The publish never did, and nothing in the design remembers that it was supposed to. Payment, inventory and notification will never hear about this order.',
        },
        ui: {
          dualWrite: 'Dual write',
          outbox: 'Outbox',
          cdc: 'CDC',
          noCrash: 'No crash',
          crashAfterCommit: 'Crash after COMMIT',
          crashAfterPublish: 'Crash after publish',
          ordersTable: 'orders table',
          outboxLabel: 'outbox',
          ordersTopic: 'orders topic',
          consistent: 'Database and topic agree.',
          lost: 'order(s) in the database that nobody was told about:',
          phantom: 'event(s) for orders that do not exist:',
          placeOrder: 'Place an order',
          runRelay: 'Run the relay',
          reset: 'Reset',
        },
      },

      partitions: {
        title: 'A key decides everything',
        lede: 'Ordering in Kafka is not a property of the topic. It is a property of the key you chose, and most surprises trace back to that choice.',
        prose: [
          {
            html: 'Our producer writes orders to <code>orders</code> with the customer id as the key. The broker hashes that key with murmur2 and takes it modulo the partition count. Same key, same partition — always.',
          },
          {
            html: 'This is the whole ordering guarantee, and it is narrower than people expect. Kafka promises that <strong>records with the same key arrive in the order they were written</strong>. It promises nothing at all about the order of two records with different keys, because they live in different partitions being read by different consumers at different speeds.',
          },
          {
            html: 'Turn on the skew and watch what happens to one customer. One customer producing most of the traffic means one partition holding most of the records — a hot partition. Adding consumers will not help: that key is pinned to that partition, and a partition is read by exactly one consumer in the group.',
          },
          {
            tone: 'warn',
            html: 'Change the partition count and look at the routing table. Keys move. That is why adding partitions to a live topic quietly breaks ordering for every key already in flight — the old records stay where they were, the new ones land somewhere else.',
          },
        ],
        predict: {
          question:
            'Your topic has 3 partitions and one customer generates 60% of orders. You add 3 more consumers. What happens to that customer’s backlog?',
          options: [
            'It drains roughly twice as fast',
            'Nothing changes — it is still one partition, one consumer',
            'Kafka rebalances the key across the new consumers',
          ],
          answer: 1,
          explanation:
            'A key maps to one partition, and within a consumer group a partition has exactly one owner. Extra consumers sit idle. The only fixes are a better key, or more partitions — and more partitions reshuffles everything.',
        },
        ui: {
          partitions: 'partitions',
          skewed: 'skewed traffic',
          routing: 'key → partition',
        },
      },

      groups: {
        title: 'A group is a claim on partitions',
        lede: 'Consumer groups are how Kafka splits work — and also where its hardest scaling limit lives.',
        prose: [
          {
            html: 'Three services read <code>orders</code>: <code>payment-service</code>, <code>inventory-service</code> and <code>notification-service</code>. Each is its own consumer group, each keeps its own offsets, and each reads every single record independently. This is the part that makes Kafka not a queue: consuming a record does not remove it, and one slow service cannot starve another.',
          },
          {
            html: 'Inside a group it works the other way round. The partitions are divided up, and every partition gets exactly one owner. Two consumers in the same group never read the same partition — that is what keeps per-key ordering intact once you scale out.',
          },
          {
            html: 'Which gives you the ceiling: <strong>partition count is the maximum parallelism</strong>. Add a fourth consumer to a three-partition topic and it does not get a smaller slice of the work. It gets nothing, and sits there idle, holding a group membership and contributing no throughput at all.',
          },
          {
            tone: 'muted',
            html: 'Click a consumer in the diagram to kill it and watch the partitions get picked up by whoever is left.',
          },
        ],
        predict: {
          question:
            'Your consumers cannot keep up. The topic has 6 partitions and you are running 6 consumers. What actually helps?',
          options: [
            'Add more consumers to the group',
            'Add partitions, or make each record cheaper to process',
            'Increase the consumer poll interval',
          ],
          answer: 1,
          explanation:
            'At 6 of 6 you are already at the parallelism ceiling; a seventh consumer idles. You either raise the ceiling by adding partitions — accepting that keys get reshuffled — or you make the work per record smaller.',
        },
        ui: {
          addConsumer: 'Add a consumer',
          idle: 'consumer(s) idle — more consumers than partitions',
          liveOver: 'live consumer(s) over',
          partitionsWord: 'partitions',
        },
      },

      rebalance: {
        title: 'The pause nobody budgets for',
        lede: 'Membership changes are routine. What they cost you is not, and it is the single most common source of unexplained latency spikes.',
        prose: [
          {
            html: 'Whenever a consumer joins or leaves, the group has to agree on who owns what. That negotiation is a rebalance, and with the classic <strong>eager</strong> protocol it is stop-the-world: every consumer gives up every partition, including the work it was halfway through, and the entire group processes nothing until the new assignment is settled.',
          },
          {
            html: 'Producers do not participate in any of this. They keep writing at full rate through the whole pause. Watch the lag counters while the group is stalled — that spike is not a slow consumer, it is a consumer group that briefly stopped existing.',
          },
          {
            html: '<strong>Cooperative sticky</strong> rebalancing fixes most of it. Instead of revoking everything, it computes the new assignment first and only takes away the partitions that actually change hands. Consumers keep working on what they already own, so the stall shrinks to almost nothing.',
          },
          {
            tone: 'danger',
            html: 'The failure mode worth recognising: if processing one batch takes longer than <code>max.poll.interval.ms</code>, the broker decides the consumer is dead and kicks it out. That triggers a rebalance, which stalls everyone, which makes the next batch take even longer — and now you have a rebalance loop that looks like the cluster is broken when the real problem is a slow handler.',
          },
        ],
        predict: {
          question:
            'An eager group is stalled in a rebalance for 40 ticks while the producer keeps writing. What does the lag graph do?',
          options: [
            'Stays flat — no consumers means no lag change',
            'Climbs, then drops sharply once the group settles',
            'Drops, because nothing is being read',
          ],
          answer: 1,
          explanation:
            'Lag is records written minus records committed. Writes continue and commits stop, so lag climbs for the whole stall and only comes back down once the group resumes and works through the backlog.',
        },
        ui: {
          eager: 'Eager (stop the world)',
          cooperative: 'Cooperative sticky',
          addConsumer: 'Add a consumer',
          stalled: 'Group stalled — rebalancing, nothing is being processed',
          stable: 'Group stable',
          lag: 'lag',
          rebalances: 'rebalance(s)',
        },
      },

      offsets: {
        title: 'At-least-once is a decision, not a setting',
        lede: 'Two lines of code in a different order is the entire difference between losing a message and processing it twice.',
        prose: [
          {
            html: 'An offset is a bookmark: the position the group has committed to having handled. Consumers do not track what they read, they track what they finished — and where you put the commit relative to the work decides what a crash costs you.',
          },
          {
            html: '<strong>Commit before processing</strong> gives you at-most-once. The bookmark moves first, then the work starts. Crash in the middle and nobody will ever read that record again, because the group has already recorded it as done. The order is silently never paid for.',
          },
          {
            html: '<strong>Commit after processing</strong> gives you at-least-once. The work happens, then the bookmark moves. Crash in between and the record is still pending, so whoever picks up the partition runs it again — the customer gets charged twice unless the handler is idempotent.',
          },
          {
            tone: 'accent',
            html: 'There is no third option that makes the problem disappear. Kafka’s transactional producer gets you exactly-once <em>within Kafka</em> — read a topic, write a topic, commit the offset atomically. The moment your handler calls a payment API, you are back to at-least-once plus an idempotency key, because that external system is not in the transaction.',
          },
          {
            tone: 'muted',
            html: 'Pick a commit mode, then kill the consumer while it is working. The log will tell you what it cost.',
          },
        ],
        predict: {
          question:
            'You commit after processing. A consumer charges a card, then dies before committing. What happens?',
          options: [
            'The charge is rolled back with the offset',
            'Another consumer replays the record and charges again',
            'Kafka detects the duplicate and skips it',
          ],
          answer: 1,
          explanation:
            'Kafka has no idea what your handler did — it only sees an uncommitted offset, so the record is still pending and gets redelivered. The broker cannot deduplicate a side effect it never saw. That is what the idempotency key is for.',
        },
        ui: {
          commitFirst: 'Commit first (at-most-once)',
          commitLast: 'Commit last (at-least-once)',
          killBusy: 'Kill a working consumer',
          lost: 'lost',
          duplicated: 'processed twice',
        },
      },

      deadLetters: {
        title: 'Dead letters, and the replay that makes it worse',
        lede: 'Kafka has no dead-letter queue. It is a convention built from ordinary topics, which is why every team builds it slightly differently and why replay is the most dangerous button in the system.',
        prose: [
          {
            html: 'One order in this batch carries a currency the handler rejects. It will never succeed, no matter how many times it runs. What you do with it decides whether you have one stuck order or a stuck partition.',
          },
          {
            html: '<strong>Retrying in place</strong> is the obvious approach and the wrong one. The consumer keeps re-running the failed record without committing, so the offset never advances — and because offsets advance in order, every healthy order behind it waits too. One bad payload stops the queue for everyone.',
          },
          {
            html: '<strong>Forwarding to a retry topic</strong> unblocks it. The failed record is produced to <code>orders.retry.5s</code>, the offset is committed, and the main partition keeps flowing. The chain gives it two more chances with growing backoff, and if it still fails it lands in <code>orders.DLQ</code> with its whole attempt history attached.',
          },
          {
            tone: 'danger',
            html: 'Then comes the part that turns an incident into a loop. Draining the DLQ back onto the main topic feels like recovery, but nothing about the message changed. It fails again, walks the chain again, and lands back in the DLQ — and on the way it competes with healthy traffic. <strong>Replay only helps after the fault is fixed.</strong> Try it in the wrong order below and watch the count come back.',
          },
        ],
        predict: {
          question:
            'Your DLQ has 12k messages from an outage. The bug is fixed and deployed. What do you do first?',
          options: [
            'Drain all 12k back onto the main topic immediately',
            'Dry-run the replay, check why they failed, then drain in batches',
            'Delete the DLQ topic — the messages are stale anyway',
          ],
          answer: 1,
          explanation:
            'Not every message in a DLQ failed for the same reason, and 12k replayed records compete with live traffic on the same partitions. Filter by error, confirm the fix covers them, replay in controlled batches — and keep the ones that still fail separate.',
        },
        ui: {
          retryInPlace: 'Retry in place',
          retryTopic: 'Forward to retry topic',
          processed: 'processed',
          blocked: 'blocked behind',
          deadLetters: 'dead letters',
          attempts: 'attempts · died at t',
          dryRunBad: 'would be replayed, and will fail again — the fault is still there.',
          dryRunGood: 'would be replayed and should now succeed.',
          dryRunPrefix: 'Dry run:',
          replay: 'Replay the DLQ',
          deployFix: 'Deploy the fix',
          toolNote:
            'Doing this on a real cluster is what {tool} is for — indexed dead letters, filtered replay and a dry run before you touch production.',
        },
      },
    },
  },
}
