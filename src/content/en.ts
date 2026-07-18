import { REPOS } from './types'
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
    labs: [
      {
        path: '/kafka',
        topic: 'Apache Kafka',
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
      {
        path: '/hookkeep',
        topic: 'Webhooks',
        title: 'Webhooks, and where they go',
        summary:
          'The provider says it delivered the event. Your database has never heard of it. Four sections on the gap between those two facts, and on why the fix is boring: write it down first.',
        topics: [
          'Persist-first vs forward-first',
          'Exponential backoff and why it needs jitter',
          'Dead letters you can still replay',
          'Rejected signatures: evidence, not work',
        ],
        cta: 'Open the lab',
      },
      {
        path: '/idempotency',
        topic: 'Idempotency',
        title: 'The same request, twice',
        summary:
          'A payment times out and the client retries. Four sections on why a key is the easy half, and on the window between checking for one and claiming it.',
        topics: [
          'Why a timeout tells you nothing',
          'Stored responses and Idempotent-Replay',
          'Check-then-claim vs INSERT ... ON CONFLICT',
          'Fingerprints, 422, and releasing a burnt key',
        ],
        cta: 'Open the lab',
      },
      {
        path: '/plans',
        topic: 'Query plans',
        title: 'This query will fall over in production',
        summary:
          'Three milliseconds here, forty seconds there, and the SQL never changed. Four sections on what moves a plan, and on telling a real regression from a moved literal.',
        topics: [
          'An index a function made unusable',
          'Where the sequential scan stops being fine',
          'Nested loops and the estimate behind them',
          'Plan shape: masking, transparent nodes, equivalence',
        ],
        cta: 'Open the lab',
      },
    ],
  },

  kafka: {
    topic: 'Apache Kafka',
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
          {
            html: `Everything above is behaviour, not tooling — but the tooling is the reason it keeps happening: a DLQ topic shows you bytes, not why a message failed or whether you already replayed it. <a href="${REPOS.kafkaDlq}" target="_blank" rel="noreferrer noopener">kafka-dlq</a> is the tool built from this section — it indexes dead letters by error reason, marks a message that came back after a replay as <em>looping</em>, and refuses a replay that has no dry-run plan behind it.`,
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

  hookkeep: {
    topic: 'Webhooks',
    title: 'Webhooks, and where they go',
    intro: [
      {
        html: 'A provider sends you an event and expects a quick 2xx. Your endpoint is slow, or restarting, or briefly down. The provider retries a few times, gives up, and marks the delivery as failed — or worse, as succeeded. Days later somebody notices a payment that never landed.',
      },
      {
        html: 'The interesting question is not why the endpoint was down. Endpoints go down. The question is what you have left afterwards, and that is decided by one line of ordering you wrote months earlier: whether the event was written to your own storage before or after you told the provider it was fine.',
      },
      {
        tone: 'muted',
        html: 'This runs entirely in your browser. There is no server and no network call: it is a deterministic model of <code>hookkeep</code>, so the same seed always replays the same incident. The status names are taken from the real schema.',
      },
    ],
    nav: ['Persist first', 'Retry', 'Replay', 'Signatures'],

    sections: {
      persistFirst: {
        title: 'Where did the webhook go?',
        lede: 'The provider dashboard says 200. Your database has never heard of the event. Both are telling the truth.',
        prose: [
          {
            html: 'A webhook receiver has two jobs, and the order it does them in is the entire design. It has to answer the provider, and it has to make the event durable. Do them in the wrong order and you have promised something you cannot keep.',
          },
          {
            html: '<strong>Forward-first</strong> looks natural: take the event, hand it to whatever needs to process it, write it down once that works. It even feels efficient — why store something you are about to finish with anyway? The problem is the word <em>afterwards</em>. Everything between the ack and the write exists only in memory, and a deploy does not wait for your memory.',
          },
          {
            tone: 'danger',
            html: 'When the process dies in that gap, the event is not delayed — it is <strong>gone</strong>. The provider already got its 2xx, so it has stopped retrying. Nothing will ever send it again. This is the failure that gets blamed on the provider, and it is not the provider.',
          },
          {
            html: '<strong>Persist-first</strong> is the boring alternative and the one <code>hookkeep</code> takes: write the raw body and headers to Postgres, and only then answer. If that write fails you return a 500 — never a fake 200 — and the provider retries, which is exactly what its retry logic is for.',
          },
          {
            tone: 'accent',
            html: 'The counter to watch is <strong>at risk</strong>: events the provider believes are delivered but that exist nowhere on disk. In persist-first it is structurally zero. That is the whole claim.',
          },
        ],
        predict: {
          question:
            'In forward-first mode, the process restarts while an event is being forwarded. What does the provider do?',
          options: [
            'Retries it, because the delivery never completed',
            'Nothing — it already got a 200 and considers the event delivered',
            'Sends it to a dead-letter endpoint',
          ],
          answer: 1,
          explanation:
            'The ack was sent up front, so as far as the provider is concerned the job is finished. Its retry machinery — the thing that would have saved you — was switched off by your own 200.',
        },
        ui: {
          modeLabel: 'Write order',
          persistFirst: 'Persist first',
          forwardFirst: 'Forward first',
          crash: 'Restart the process',
          stored: 'On disk',
          delivered: 'Delivered',
          atRisk: 'At risk',
          lost: 'Lost for good',
          providerView: 'What the provider thinks',
          ourView: 'What you actually have',
        },
      },

      retryBackoff: {
        title: 'The endpoint is down. Now what?',
        lede: 'Retrying is easy. Retrying without turning your recovery into a second outage is the part people skip.',
        prose: [
          {
            html: 'Take the endpoint down and watch the attempts. The interval does not stay flat — it doubles: <code>base * 2^(attempt-1)</code>, capped so it never grows into next week. A downstream that is struggling gets hit less often, not more, which is the opposite of what a naive retry loop does.',
          },
          {
            html: 'The part that looks like decoration is the <strong>jitter</strong>, ±20% on every interval. Without it, every delivery that failed during the same outage comes back at the same instant. The endpoint recovers, receives the entire backlog as one spike, and falls over again — and now the whole fleet is synchronised, so it happens on every retry round.',
          },
          {
            html: 'After the configured number of attempts the delivery is marked <code>dead</code>. That word causes trouble, so: dead does not mean discarded. The row is still there, the body is still there, and section three is about getting it back.',
          },
          {
            tone: 'warn',
            html: 'The genuinely nasty state is not <code>down</code> — it is <code>slow</code>. A timeout tells you nothing about whether the endpoint processed the request before it stopped answering. Retrying might be a duplicate; not retrying might be a loss. This is why the event id travels with every delivery: the receiver dedupes, and the sender stops having to guess.',
          },
        ],
        predict: {
          question: 'Why add random jitter to a backoff that is already exponential?',
          options: [
            'To make the retries harder to predict for an attacker',
            'So deliveries that failed together do not retry together and re-break the endpoint',
            'To spread load evenly across worker processes',
          ],
          answer: 1,
          explanation:
            'A shared outage synchronises every failed delivery onto the same schedule. Jitter is what breaks that lockstep, so recovery arrives as a spread rather than a thundering herd.',
        },
        ui: {
          endpointLabel: 'Endpoint',
          up: 'Up',
          slow: 'Slow',
          down: 'Down',
          delivered: 'Delivered',
          retrying: 'Retrying',
          dead: 'Dead',
          attempts: 'attempts',
          nextIn: 'next attempt in',
          waiting: 'waiting',
        },
      },

      replay: {
        title: 'Replay: the part only you can do',
        lede: 'The provider stopped retrying days ago. The event still exists — because the copy is yours.',
        prose: [
          {
            html: 'Bring the endpoint back up and replay the dead deliveries. The gap closes. Nothing about that is remarkable, and that is precisely the point: recovery is uneventful when the data never left.',
          },
          {
            html: 'Compare it with the alternative. If the event was never persisted, there is no replay to run — the provider has moved on, its retry window closed, and the only path left is a support ticket asking a company to resend something from last Tuesday. Persisting first is what converts an incident into a chore.',
          },
          {
            tone: 'warn',
            html: 'Replay is at-least-once and unapologetic about it: it will re-send events that already succeeded, because it cannot know what your consumer did with them. Every delivery carries the event id in a header so the receiver can dedupe. If your handler is not idempotent, replay is where you find out.',
          },
          {
            tone: 'accent',
            html: 'Dry-run before you fire. A replay that runs while the endpoint is still broken does not fix anything — it just walks the same deliveries back into <code>dead</code>, and buries the original timestamps under a fresh round of failures.',
          },
        ],
        predict: {
          question: 'The endpoint is still down and you replay the dead deliveries anyway. Then?',
          options: [
            'They queue up and deliver once the endpoint recovers',
            'They burn through their attempts again and land back in dead',
            'Replay refuses to run while the endpoint is unhealthy',
          ],
          answer: 1,
          explanation:
            'Replay re-enqueues; it does not wait for the world to be better. Nothing was fixed, so the same attempts fail the same way. Fix first, replay second — that ordering is the whole lesson.',
        },
        ui: {
          replay: 'Replay dead deliveries',
          bringUp: 'Bring the endpoint up',
          dryRunPrefix: 'Dry run:',
          dryRunGood: 'would be replayed and should now succeed.',
          dryRunBad: 'would be replayed — the endpoint is still unhealthy, so they will die again.',
          dead: 'Dead',
          delivered: 'Delivered',
          replayed: 'via replay',
          toolNote:
            'Running this against real traffic is what {tool} is for — every event stored with its raw body, replay by id or by time range, and a dry run before you touch production.',
        },
      },

      signature: {
        title: 'A signature that does not verify',
        lede: 'Someone posts to your webhook URL. It is public, so of course they can. What should be stored, and what should be run?',
        prose: [
          {
            html: 'The ingest endpoint has to be reachable by the provider, which means it is reachable by everybody. Authentication is the signature: an HMAC over the raw body with a shared secret, sent in a header the provider defines — <code>Stripe-Signature</code>, <code>X-Hub-Signature-256</code>, and so on.',
          },
          {
            html: 'When it does not verify, there are two obvious reactions and both are wrong. Processing it anyway is the security hole. Dropping it on the floor is the forensic one: an unexplained forged request is exactly what you want to look at afterwards, and you cannot look at what you deleted.',
          },
          {
            tone: 'accent',
            html: 'So the event is <strong>stored</strong> with <code>verify_status = rejected</code> and a reason, the caller gets a 401, and no delivery row is created. Kept as evidence, never treated as work. Those are separate decisions and the schema keeps them on separate axes: <code>verify_status</code> answers <em>is this real</em>, <code>deliveries.status</code> answers <em>did it get there</em>.',
          },
          {
            tone: 'warn',
            html: 'A range replay skips rejected events on purpose. Sweeping a time window and accidentally acting on a payload nobody could prove came from the provider is not a mistake you want available by default.',
          },
        ],
        predict: {
          question: 'A request arrives with a signature that does not verify. What happens to it?',
          options: [
            'Rejected and discarded — nothing is written',
            'Stored as rejected evidence, returned a 401, never delivered',
            'Stored and delivered, with a warning logged',
          ],
          answer: 1,
          explanation:
            'Storing it and running it are different decisions. It is kept because you will want it during the review, and it is never enqueued because nobody could prove where it came from.',
        },
        ui: {
          verifierLabel: 'Signature verification',
          verifierOn: 'Configured',
          verifierOff: 'None for this source',
          verified: 'Verified',
          unverified: 'Unverified',
          rejected: 'Rejected',
          delivered: 'Delivered',
          evidence: 'Stored as evidence, no delivery row',
          reason: 'reason',
        },
      },
    },
  },

  idempotency: {
    topic: 'Idempotency',
    title: 'The same request, twice',
    intro: [
      {
        html: 'A payment request times out. The client has no idea whether the charge went through — a timeout is the absence of an answer, not an answer — so it does the only sensible thing and retries. Did the customer just pay twice?',
      },
      {
        html: 'Almost everyone reaches for the same fix: attach a key, check whether you have seen it before. That part is easy and it is not where this goes wrong. It goes wrong in the gap between checking and claiming, which is invisible until two requests arrive in the same millisecond.',
      },
      {
        tone: 'muted',
        html: 'This runs entirely in your browser. There is no server and no network call: it is a deterministic model of <code>go-idempotent</code>, so the same seed always replays the same incident. Status codes and state names are the ones the library actually returns.',
      },
    ],
    nav: ['Unprotected', 'With a key', 'The race', 'Same key, new body'],

    sections: {
      unprotected: {
        title: 'The retry that charges twice',
        lede: 'Nothing here is broken. The network is slow, the client is well behaved, and the customer is billed twice.',
        prose: [
          {
            html: 'Watch the sequence. The request arrives, the handler starts working, and it takes longer than the client is willing to wait. The client times out and retries — correctly, because from where it sits the request may never have been received at all.',
          },
          {
            tone: 'danger',
            html: 'The first request was never cancelled. A client timeout closes a connection; it does not reach into the server and stop the work. So both requests run, both succeed, and both charge. <strong>Two charges, two 201s, and no error anywhere in your logs.</strong>',
          },
          {
            html: 'This is why retries and idempotency are the same conversation. Any client that retries — every HTTP library, every job runner, every payment provider calling your webhook — turns "at least once" into your problem. The network guarantees delivery at least once; only you can make the second one harmless.',
          },
          {
            tone: 'accent',
            html: 'Notice what the timeout does <em>not</em> tell you: whether the work happened. That single missing bit of information is the entire reason this section exists, and no amount of retry tuning recovers it.',
          },
        ],
        predict: {
          question:
            'The client times out after 12 ticks; the handler needs 24. What has happened at tick 13?',
          options: [
            'The request was cancelled when the client disconnected',
            'The handler is still running and will charge the card',
            'The handler rolled back because nobody is listening',
          ],
          answer: 1,
          explanation:
            'Nothing told the handler that anyone stopped waiting. It finishes the work and commits the charge — to a client that already gave up and is about to send the request again.',
        },
        ui: {
          send: 'Send the payment',
          retry: 'Client retries',
          charges: 'Charges',
          total: 'Total billed',
          requests: 'Requests',
          timedOut: 'timed out',
          processing: 'handler running',
          doubleCharged: 'The customer was charged twice for one order.',
        },
      },

      withKey: {
        title: 'A key, and a stored answer',
        lede: 'The fix is not to stop the second request. It is to make the second request harmless.',
        prose: [
          {
            html: 'The client generates a key once — per payment, not per attempt — and sends it as <code>Idempotency-Key</code> on every attempt of that payment. The server stores the key alongside the response it produced.',
          },
          {
            html: 'Now the retry does not run the handler. It finds a completed row, replays the stored status code and body verbatim, and adds <code>Idempotent-Replay: true</code> so the caller can tell a replay from a fresh execution. One charge, and the client still gets its answer — the <em>same</em> answer, including the charge id it missed the first time.',
          },
          {
            tone: 'warn',
            html: 'There is a timing subtlety worth pressing the button for: if the retry arrives while the first request is <em>still running</em>, there is no stored response yet, so there is nothing to replay. The library answers <code>409</code> instead. Retrying too eagerly gets you a conflict, not an answer.',
          },
          {
            tone: 'accent',
            html: 'The key belongs to the client, and that is not an implementation detail. Only the caller knows that two HTTP requests are the same intent — the server sees two identical-looking payloads and cannot tell a retry from a customer legitimately buying the same thing twice.',
          },
        ],
        predict: {
          question: 'The retry arrives 4 ticks after the first request, which needs 24. What comes back?',
          options: [
            'The stored response, replayed',
            '409 — the first request has not committed anything to replay yet',
            'It waits until the first finishes, then returns its response',
          ],
          answer: 1,
          explanation:
            'The stored response only exists after the handler commits. Until then the row is in_flight, and the library answers 409 immediately rather than holding the connection open.',
        },
        ui: {
          send: 'Send the payment',
          retry: 'Client retries',
          retryEarly: 'Retry immediately',
          charges: 'Charges',
          total: 'Total billed',
          requests: 'Requests',
          replayed: 'replayed from store',
          storeLabel: 'idempotency_keys',
          fresh: 'handler ran',
        },
      },

      race: {
        title: 'Two requests, same millisecond',
        lede: 'Check-then-claim is correct every time you test it by hand, and wrong the first time production sends you two at once.',
        prose: [
          {
            html: 'The obvious implementation reads first: look up the key, and if it is not there, claim it and run. Sequentially this is flawless — every retry in the previous section would still be caught.',
          },
          {
            tone: 'danger',
            html: 'But the read and the write are two statements, and between them there is a window. Two requests can both read <em>nothing here</em> before either writes. Both then claim the key, both run the handler, and you are back to two charges — with idempotency code sitting right there in the stack trace, apparently doing its job.',
          },
          {
            html: 'The fix is not a lock, a mutex or a queue. It is one statement that does both: <code>INSERT ... ON CONFLICT (key) DO NOTHING</code>. Whoever affects a row won the claim; whoever affects zero rows lost it and reads what the winner wrote. The database was always going to be the arbiter here — this just stops pretending otherwise.',
          },
          {
            tone: 'accent',
            html: 'The loser gets <code>409</code> straight away rather than being parked until the winner finishes. Holding the connection would give a nicer answer, but it also means a slow handler now occupies two sockets instead of one, and a stampede of retries becomes a stampede of held connections. Failing fast is the cheaper trade.',
          },
        ],
        predict: {
          question:
            'Both requests arrive at the same instant and the endpoint uses check-then-claim. How many charges?',
          options: [
            'One — the key is checked before either runs',
            'Two — both read an empty store before either writes',
            'None — the conflicting writes cancel each other',
          ],
          answer: 1,
          explanation:
            'The check passed for both, because at the moment each of them looked, the key genuinely was not there. Atomicity is what closes that window, not the check itself.',
        },
        ui: {
          protection: 'Claim strategy',
          readThenWrite: 'Check, then claim',
          insertOnConflict: 'INSERT ... ON CONFLICT',
          sendBoth: 'Send both at once',
          charges: 'Charges',
          total: 'Total billed',
          requests: 'Requests',
          won: 'won the row',
          lost: 'lost the row',
          toolNote:
            'The middleware that does this — atomic claim, stored response, replay header — is {tool}. The Postgres store behind it is a single table with a primary key doing the arbitration.',
        },
      },

      fingerprint: {
        title: 'Same key, different body',
        lede: 'Two things that must never be confused: a retry of a request, and a different request wearing its key.',
        prose: [
          {
            html: 'A key alone is not enough to prove two requests are the same. Clients reuse keys by accident — a loop variable that did not advance, a cached header, a copy-pasted curl. If the server replayed blindly, a customer paying 999 TRY would receive the stored answer for a 249.90 TRY charge and believe the larger payment succeeded.',
          },
          {
            html: 'So the stored row also holds a fingerprint: a SHA-256 of the request body. On a hit, the body must match. If it does not, the answer is <code>422</code> — <em>idempotency key reused with a different request</em> — and nothing is replayed and nothing is charged. The mismatch is a bug in the caller, and it is told so rather than quietly handed someone else\'s receipt.',
          },
          {
            tone: 'accent',
            html: 'The other half of getting this right is what happens when the handler <strong>fails</strong>. The key was claimed before the work started, so a naive implementation leaves an <code>in_flight</code> row behind forever and every future retry answers 409 — the endpoint has locked itself out of a payment that never happened.',
          },
          {
            html: 'The middleware releases the key when the handler does not commit. A failed request must not burn its key: the whole point of a retry is that the next attempt can still succeed. Turn the handler failure on, send a request, turn it off, and retry — the charge goes through.',
          },
        ],
        predict: {
          question:
            'The handler crashes after the key was claimed but before any charge. What must happen to the row?',
          options: [
            'It stays in_flight so the request cannot be repeated',
            'It is released, so a retry with the same key can still succeed',
            'It is marked completed with the error response stored',
          ],
          answer: 1,
          explanation:
            'Nothing happened, so nothing should be remembered. Leaving the row claimed would make a transient failure permanent — every later retry would get a 409 for work that was never done.',
        },
        ui: {
          sendOriginal: 'Pay 249.90',
          sendDifferent: 'Reuse the key for 999.00',
          failToggle: 'Handler fails',
          retry: 'Retry same key',
          charges: 'Charges',
          total: 'Total billed',
          requests: 'Requests',
          storeLabel: 'idempotency_keys',
          released: 'key released',
          empty: 'no rows',
        },
      },
    },
  },

  plans: {
    topic: 'Query plans',
    title: 'This query will fall over in production',
    intro: [
      {
        html: 'The query is 3 ms on your laptop and 40 seconds in production. The row count is the obvious suspect and it is rarely the whole answer — the same query against the same data can be fast or catastrophic depending on the <strong>plan</strong> PostgreSQL picks.',
      },
      {
        html: 'That is what makes plan regressions unpleasant to review. The SQL did not change. Nobody touched the query in the pull request that broke it. An index was dropped, a column got wrapped in a function, a statistic went stale — and the plan quietly became a different plan.',
      },
      {
        tone: 'warn',
        html: '<strong>This is not PostgreSQL\'s planner.</strong> It does not read statistics, cost alternatives, or consider more than a handful of options. It is a model of <em>why</em> a plan changes: table size, whether an index is usable, and whether the row estimate is any good. The node names, normalisation rules, finding codes and severities are taken from <code>pg-plan-guard</code>, so what you learn here matches its real output.',
      },
    ],
    nav: ['Lost index', 'Scale', 'Bad estimate', 'Plan shape'],

    sections: {
      lostIndex: {
        title: 'The index that stopped being used',
        lede: 'The index still exists. The query still runs. It simply cannot use it any more, and nothing says so.',
        prose: [
          {
            html: 'A btree on <code>email</code> stores that column\'s values. Ask for <code>lower(email) = ?</code> and the index is useless: the planner would have to call <code>lower()</code> on every stored value to find out which rows match, which is the sequential scan it was trying to avoid.',
          },
          {
            tone: 'danger',
            html: 'Nothing warns you. The query is valid, the index is still there, the tests pass. On a development database with ten thousand rows the scan takes a millisecond and nobody notices. The bill arrives when the table does.',
          },
          {
            html: 'The fix is an index on the same expression the query uses — <code>CREATE INDEX ... ON customers (lower(email))</code> — after which the planner recognises the predicate and goes back to a lookup. Toggle it and watch the node change.',
          },
          {
            tone: 'accent',
            html: 'This is exactly the class of change a plan guard exists for. Dropping an index is a one-line migration that touches no application code, so it reviews as harmless; the query it breaks may live in another repository entirely.',
          },
        ],
        predict: {
          question:
            'A btree exists on email. The query filters on lower(email). What does the planner do?',
          options: [
            'Uses the index, then applies lower() to the results',
            'Ignores the index and scans the table',
            'Raises an error about the type mismatch',
          ],
          answer: 1,
          explanation:
            'The index holds email, not lower(email). There is no way to find matching entries without evaluating the function on every row — which is a sequential scan. The index is not wrong, it is simply not applicable.',
        },
        ui: {
          predicateLabel: 'Predicate',
          plain: 'created_at >= ?',
          lower: 'lower(email) = ?',
          addFunctional: 'Add the functional index',
          dropFunctional: 'Drop the functional index',
          planLabel: 'Plan',
          estimate: 'estimated',
          rowsLabel: 'rows',
        },
      },

      scale: {
        title: 'A thousand rows is not ten million',
        lede: 'Sequential scans are not a mistake. They are the right plan, right up until they are the worst one.',
        prose: [
          {
            html: 'Reading a whole table of a thousand rows costs almost nothing, and doing it sequentially is often faster than the random access an index implies. The planner knows this, which is why a small table gets a <code>Seq Scan</code> and nobody should be alarmed by it.',
          },
          {
            html: 'Drag the table size up. The scan cost grows with every row, because it does the same work per row and there are more of them. The indexed lookup barely moves: it descends a tree whose depth grows logarithmically and reads only what matches.',
          },
          {
            tone: 'warn',
            html: 'So the plan that was correct in staging is a different plan in production, and the gap is not a factor of two — it is the difference between a page load and a timeout. Staging with a tenth of the data does not test the plan you will actually run.',
          },
          {
            html: 'Above a few thousand matched rows this model switches to a <code>Bitmap Heap Scan</code>: collect the matching locations first, then read the heap in physical order rather than jumping around it. Same index, same access path — and the last section explains why a guard must not call that a regression.',
          },
        ],
        predict: {
          question:
            'The same query runs against 1,000 rows and against 10,000,000. What happens to the sequential scan?',
          options: [
            'It stays roughly as fast, since disks read sequentially',
            'It grows with the table, from milliseconds to a timeout',
            'The planner would never choose it at either size',
          ],
          answer: 1,
          explanation:
            'A sequential scan does constant work per row, so its cost is linear in the table. At a thousand rows that is invisible; at ten million it is the incident. The indexed lookup grows logarithmically, which is why the two curves cross.',
        },
        ui: {
          rowsLabel: 'rows in orders',
          withIndex: 'With the index',
          withoutIndex: 'Without it',
          planLabel: 'Plan',
          estimate: 'estimated',
          slower: 'slower',
        },
      },

      nestedLoop: {
        title: 'The estimate that was off by 400×',
        lede: 'A nested loop is the fastest join there is, when the outer side really is small. The planner finds out it was wrong at run time.',
        prose: [
          {
            html: 'Joining two tables, PostgreSQL picks between a handful of strategies. A <strong>nested loop</strong> walks the outer rows and looks each one up on the inner side — unbeatable when the outer side is a few rows. A <strong>hash join</strong> builds a hash table once and probes it, which costs more to start and far less per row.',
          },
          {
            html: 'The choice is made from an <em>estimate</em>. If the statistics say the filter matches 30 rows, the loop is obviously right. If it actually matches 12,000, the same plan performs twelve thousand inner lookups, and a query that took 4 ms takes half a minute.',
          },
          {
            tone: 'danger',
            html: 'None of this is a bug in PostgreSQL, and none of it appears in the query. Statistics go stale after a bulk load, after a backfill, after a table grows faster than autovacuum samples it. The plan is a rational conclusion from the wrong number.',
          },
          {
            tone: 'accent',
            html: 'A join-method change is a <code>warn</code>, not a <code>crit</code>: sometimes it is a legitimate response to data that genuinely changed. It is a finding you want to see in a diff and decide about, rather than one that blocks a deploy on its own.',
          },
        ],
        predict: {
          question:
            'Statistics say a filter matches 30 rows; it really matches 12,000. The planner chose a nested loop. What happens?',
          options: [
            'It notices mid-query and switches to a hash join',
            'It performs 12,000 inner lookups and takes far longer than planned',
            'It returns only the 30 rows it planned for',
          ],
          answer: 1,
          explanation:
            'The plan is fixed before execution starts; nothing switches once it is running. The loop simply runs for every row it actually finds, which is the entire cost of a bad estimate.',
        },
        ui: {
          statsLabel: 'Statistics',
          fresh: 'Fresh',
          stale: 'Stale',
          estimatedRows: 'estimated',
          actualRows: 'actual',
          planLabel: 'Plan',
          estimate: 'estimated',
          offBy: 'off by',
        },
      },

      shape: {
        title: 'What changed, and what only looks like it changed',
        lede: 'EXPLAIN output differs on every run. Almost none of that difference means anything.',
        prose: [
          {
            html: 'To catch plan regressions in CI you have to compare two plans, and comparing the text is hopeless: costs move, row estimates move, literals differ per run, and a parallel worker appears or does not. Compare the text and every build fails; compare nothing and the regression ships.',
          },
          {
            html: 'So the plan is reduced to a <strong>shape</strong>: node types, relations, index names, join types, and conditions with their literals masked to <code>?</code>. Costs, row counts and timings never enter it. Change the literal in the query and the shape hash does not move — that is the property the whole tool rests on.',
          },
          {
            html: 'Two more rules exist because the alternative is a guard nobody trusts. <code>Materialize</code>, <code>Memoize</code>, <code>Gather</code> and <code>Gather Merge</code> are dropped when they have a single child, since their presence tracks cost estimates rather than the query. And an <code>Index Scan</code> and a <code>Bitmap Heap Scan</code> over the same index are declared equivalent, because PostgreSQL chooses between them on row counts alone.',
          },
          {
            tone: 'accent',
            html: 'What survives all of that is a real regression: an index dropped, a scan degraded, a predicate no longer served by the index. Those get a <code>crit</code> and a non-zero exit. A baseline that is stale or missing fails too, whatever <code>--fail-on</code> says — a comparison that could not be made is not a pass.',
          },
        ],
        predict: {
          question:
            'The same query runs twice with different literals, and the second run gets a parallel plan. Should the guard fail?',
          options: [
            'Yes — the EXPLAIN output is different',
            'No — masked literals and a dropped Gather leave the same shape',
            'Only if the cost changed by more than half',
          ],
          answer: 1,
          explanation:
            'Neither difference is structural. Literals are masked to ? and a single-child Gather is transparent, so both runs normalise to the same shape and the same hash. Failing on either would make the guard noise, and a noisy guard gets switched off.',
        },
        ui: {
          literalLabel: 'Literal in the query',
          parallelLabel: 'Parallel plan',
          dropIndex: 'Drop the index',
          restoreIndex: 'Restore the index',
          baseline: 'Baseline',
          current: 'Current',
          hashLabel: 'shape hash',
          identical: 'Same shape — nothing to report.',
          exitOk: 'exit 0',
          exitFail: 'exit 1',
          toolNote:
            'Snapshotting the shape into a committed plans.lock.json and comparing it on every build is what {tool} does — which is how it fails on a dropped index without failing on a moved literal.',
        },
      },
    },
  },
}
