import type { Content } from './types'

export const tr: Content = {
  locale: 'tr',

  chrome: {
    home: 'lab',
    siteLabel: 'yusufdariyemez.com',
    siteHref: 'https://yusufdariyemez.com',
    repoLabel: 'GitHub',
    otherLocale: 'English',
    otherLocaleHref: '/',
    builtBy: 'Yapan:',
    sourceOn: 'Kaynak kodu:',
    disclaimer:
      'Buradaki simülasyonlar öğretme modeli, emülatör değil. Her bölümün konusu olan davranışı birebir üretir, gerisini bilerek dışarıda bırakır.',
    relatedRepo: 'İlgili repository',
    controls: {
      play: 'Oynat',
      pause: 'Duraklat',
      step: 'Adımla',
      restart: 'Baştan',
      speed: 'hız',
    },
    emptyLog: 'henüz bir şey olmadı',
    predictRight: 'Doğru.',
    predictWrong: 'Tam değil.',
  },

  home: {
    title: 'lab',
    tagline: 'Backend sistemleri, davranışlarıyla anlatılıyor.',
    intro: [
      {
        html: 'Dağıtık sistem anlatımlarının çoğu mimariyi gösterir — kutular, oklar, happy path. Zaten kolay kısmı orası. Sana bir geceye mal olan şey davranış: bir process işin ortasında öldüğünde, bir queue tek bir bozuk mesajın arkasında biriktiğinde, iki sistem neyin yazıldığı konusunda anlaşamadığında ne oluyor?',
      },
      {
        html: 'Buradakiler tam olarak bunun interaktif modelleri. Kontroller sende, bozan kontroller dahil; ve hata burada ek bölüm değil, konunun kendisi.',
      },
    ],
    principles: [
      {
        title: 'Mimari değil, davranış',
        body: 'Her lab, diyagramların bittiği yerden başlıyor — crash\'te, tıkanmada, duplicate\'te. Bir kavram statik bir resimden anlaşılabiliyorsa burada yok.',
      },
      {
        title: 'Deterministik',
        body: 'Her simülasyon seed\'li. Aynı koşu hep aynı olayı tekrar oynatır; duraklatıp geri adımlayabilir, kaçırdığın anı görebilirsin.',
      },
      {
        title: 'Kurulum yok',
        body: 'Broker yok, backend yok, hesap yok. Modeller tamamen tarayıcında çalışıyor — istediğin kadar sert bozabilmenin sebebi de bu.',
      },
    ],
    labsHeading: 'Lab\'lar',
    kafkaCard: {
      title: 'Kafka, davranışıyla',
      summary:
        'Kafka\'nın hata anında gerçekte ne yaptığı üzerine altı bölüm — ilk byte broker\'a ulaşmadan önce, atomik olmayan o iki yazma işleminden başlayarak.',
      topics: [
        'Dual write, outbox ve CDC',
        'Key routing ve hot partition\'lar',
        'Consumer group\'lar ve paralellik tavanı',
        'Rebalance tıkanmaları',
        'At-most-once ve at-least-once',
        'Dead letter\'lar ve döngüye giren replay',
      ],
      cta: 'Lab\'ı aç',
    },
  },

  kafka: {
    title: 'Kafka, davranışıyla',
    intro: [
      {
        html: 'Kafka görselleştirmelerinin çoğu mimariyi gösterir: producer\'lar, broker\'lar, aralarında oklar olan kutular. Bu onu atlayıp doğrudan gecenin üçünde seni arayan kısımlara giriyor — dual write\'lar, hot partition\'lar, rebalance tıkanmaları, yanlış sırada commit edilen offset\'ler ve güvenle replay edemediğin dead letter\'lar.',
      },
      {
        tone: 'muted',
        html: 'Buradaki her şey tarayıcında çalışıyor. Broker yok, backend yok, network çağrısı yok: deterministik bir model, yani aynı seed hep aynı olayı tekrar oynatıyor. İstediğin kadar sert boz.',
      },
    ],
    nav: ['Yazma yolu', 'Partition\'lar', 'Group\'lar', 'Rebalance', 'Offset\'ler', 'Dead letter\'lar'],

    sections: {
      writePath: {
        title: 'Veri nereden geliyor?',
        lede: 'Diğer bütün Kafka anlatımları hazır bir producer\'la başlıyor. En pahalı hata bundan daha önce yapılıyor.',
        prose: [
          {
            html: 'Kafka ne bir veritabanı ne de bir cache. Uygulamanın <em>yazdığı</em> append-only bir log — yani aldığın her siparişte iki ayrı sistemin güncellenmesi gerekiyor: gerçeğin sahibi olan veritabanı ve bunu herkese duyuran log.',
          },
          {
            html: 'Bu iki yazma işlemi atomik değil. Postgres ile bir broker\'ı kapsayan transaction diye bir şey yok. Aradaki boşlukta crash olursa iki bozuk sonuçtan birini alırsın; hangisini aldığın da sadece kodu hangi sırayla yazdığına bağlı.',
          },
          {
            tone: 'accent',
            html: 'Açıkça söylemekte fayda var, çünkü en yaygın karışıklık bu: <strong>Bu event log\'un kaynağı Redis değildir.</strong> Redis bir cache, bir lock, kısa ömürlü bir queue. Onu bu yola koymak sana dayanıklılık değil, yazma kaybedebileceğin bir sistem daha kazandırır.',
          },
          {
            html: 'Çözüm iki yazma işlemini daha sıkı denemek değil. İki tane olmasını bırakmak. <strong>Outbox</strong> pattern\'ıyla sipariş satırı ve event satırı tek bir transaction içinde yazılır, outbox\'ı da ayrı bir relay sonradan boşaltır — atomiklik veritabanının problemi haline gelir, yani bu işte gerçekten iyi olan tek sistemin. <strong>CDC</strong> bir adım öteye gider: outbox tablosu yok, relay doğrudan Postgres\'in WAL\'ini takip eder ve uygulama Kafka\'nın varlığından hiç haberdar olmaz.',
          },
        ],
        predict: {
          question:
            'Dual write: uygulama siparişi commit ediyor, sonra publish etmeden ölüyor. Sistemin geri kalanı ne görüyor?',
          options: [
            'Hiçbir şey — sipariş de rollback olur',
            'Var olan ama kimseye duyurulmamış bir sipariş',
            'Event geç gelir, uygulama yeniden başlayınca',
          ],
          answer: 1,
          explanation:
            'COMMIT çoktan gerçekleşti, yani sipariş gerçek ve kalıcı. Publish hiç gerçekleşmedi ve tasarımda bunun yapılması gerektiğini hatırlayan hiçbir şey yok. Payment, inventory ve notification bu siparişi hiçbir zaman duymayacak.',
        },
        ui: {
          dualWrite: 'Dual write',
          outbox: 'Outbox',
          cdc: 'CDC',
          noCrash: 'Crash yok',
          crashAfterCommit: 'COMMIT sonrası crash',
          crashAfterPublish: 'Publish sonrası crash',
          ordersTable: 'orders tablosu',
          outboxLabel: 'outbox',
          ordersTopic: 'orders topic\'i',
          consistent: 'Veritabanı ve topic uyumlu.',
          lost: 'veritabanında olup kimseye söylenmemiş sipariş:',
          phantom: 'var olmayan siparişlere ait event:',
          placeOrder: 'Sipariş oluştur',
          runRelay: 'Relay\'i çalıştır',
          reset: 'Sıfırla',
        },
      },

      partitions: {
        title: 'Her şeyi bir key belirliyor',
        lede: 'Kafka\'da sıralama topic\'in değil, seçtiğin key\'in bir özelliği — sürprizlerin çoğu da bu seçime dayanıyor.',
        prose: [
          {
            html: 'Producer\'ımız siparişleri <code>orders</code> topic\'ine müşteri id\'sini key olarak kullanarak yazıyor. Broker bu key\'i murmur2 ile hash\'leyip partition sayısına göre mod alıyor. Aynı key, aynı partition — her zaman.',
          },
          {
            html: 'Sıralama garantisinin tamamı bu ve insanların sandığından çok daha dar. Kafka <strong>aynı key\'e sahip kayıtların yazıldıkları sırayla ulaşacağını</strong> vaat eder. Farklı key\'e sahip iki kaydın sırası hakkında hiçbir şey vaat etmez, çünkü onlar farklı partition\'larda durur ve farklı consumer\'lar tarafından farklı hızlarda okunur.',
          },
          {
            html: 'Skew\'i aç ve tek bir müşteride ne olduğunu izle. Trafiğin çoğunu tek bir müşteri üretiyorsa kayıtların çoğunu tek bir partition tutuyor demektir — hot partition. Consumer eklemek işe yaramaz: o key o partition\'a sabitlenmiştir ve bir partition group içinde tam olarak tek bir consumer tarafından okunur.',
          },
          {
            tone: 'warn',
            html: 'Partition sayısını değiştir ve routing tablosuna bak. Key\'ler yer değiştiriyor. Canlı bir topic\'e partition eklemenin, halihazırda akışta olan her key için sıralamayı sessizce bozmasının sebebi bu — eski kayıtlar oldukları yerde kalır, yenileri başka yere düşer.',
          },
        ],
        predict: {
          question:
            'Topic\'inde 3 partition var ve tek bir müşteri siparişlerin %60\'ını üretiyor. 3 consumer daha ekliyorsun. O müşterinin birikmiş backlog\'una ne olur?',
          options: [
            'Yaklaşık iki kat hızlı boşalır',
            'Hiçbir şey değişmez — hâlâ tek partition, tek consumer',
            'Kafka key\'i yeni consumer\'lar arasında yeniden dağıtır',
          ],
          answer: 1,
          explanation:
            'Bir key tek bir partition\'a düşer ve bir consumer group içinde bir partition\'ın tam olarak tek bir sahibi vardır. Fazladan consumer\'lar boş oturur. Tek çözüm ya daha iyi bir key ya da daha fazla partition — ve daha fazla partition her şeyi yeniden karıştırır.',
        },
        ui: {
          partitions: 'partition',
          skewed: 'çarpık trafik',
          routing: 'key → partition',
        },
      },

      groups: {
        title: 'Group, partition\'lar üzerinde bir hak iddiasıdır',
        lede: 'Consumer group\'lar Kafka\'nın işi bölme biçimi — ve aynı zamanda en sert ölçekleme sınırının yaşadığı yer.',
        prose: [
          {
            html: '<code>orders</code> topic\'ini üç servis okuyor: <code>payment-service</code>, <code>inventory-service</code> ve <code>notification-service</code>. Her biri kendi consumer group\'u, her biri kendi offset\'lerini tutuyor ve her biri her kaydı bağımsız olarak okuyor. Kafka\'yı bir queue olmaktan çıkaran kısım bu: bir kaydı tüketmek onu silmez ve yavaş bir servis diğerini aç bırakamaz.',
          },
          {
            html: 'Group\'un içinde işler tam tersine yürür. Partition\'lar paylaştırılır ve her partition tam olarak tek bir sahip alır. Aynı group\'taki iki consumer asla aynı partition\'ı okumaz — ölçeklendiğinde key başına sıralamayı ayakta tutan şey budur.',
          },
          {
            html: 'Tavan da buradan çıkıyor: <strong>partition sayısı maksimum paralelliktir</strong>. Üç partition\'lı bir topic\'e dördüncü consumer\'ı eklediğinde işin daha küçük bir dilimini almaz. Hiçbir şey almaz; orada boş oturur, bir group üyeliği tutar ve throughput\'a sıfır katkı yapar.',
          },
          {
            tone: 'muted',
            html: 'Diyagramdaki bir consumer\'a tıklayıp öldür ve partition\'ların kalanlar tarafından nasıl devralındığını izle.',
          },
        ],
        predict: {
          question:
            'Consumer\'ların yetişemiyor. Topic\'te 6 partition var ve 6 consumer çalıştırıyorsun. Gerçekte ne işe yarar?',
          options: [
            'Group\'a daha fazla consumer eklemek',
            'Partition eklemek ya da kayıt başına işlemeyi ucuzlatmak',
            'Consumer poll aralığını artırmak',
          ],
          answer: 1,
          explanation:
            '6\'da 6 ile zaten paralellik tavanındasın; yedinci consumer boş oturur. Ya partition ekleyip tavanı yükseltirsin — key\'lerin yeniden karışmasını kabul ederek — ya da kayıt başına düşen işi küçültürsün.',
        },
        ui: {
          addConsumer: 'Consumer ekle',
          idle: 'consumer boşta — partition\'dan fazla consumer var',
          liveOver: 'canlı consumer /',
          partitionsWord: 'partition',
        },
      },

      rebalance: {
        title: 'Kimsenin hesaba katmadığı duraklama',
        lede: 'Üyelik değişiklikleri rutindir. Sana maliyeti değildir — ve açıklanamayan latency sıçramalarının en yaygın tek kaynağıdır.',
        prose: [
          {
            html: 'Bir consumer gruba katıldığında ya da ayrıldığında, group\'un neyin kime ait olduğunda anlaşması gerekir. Bu pazarlığın adı rebalance ve klasik <strong>eager</strong> protokolüyle stop-the-world çalışır: her consumer her partition\'ı bırakır — yarıda kalan işi dahil — ve yeni atama oturana kadar tüm group hiçbir şey işlemez.',
          },
          {
            html: 'Producer\'lar bunun hiçbirine katılmaz. Duraklama boyunca tam hızda yazmaya devam ederler. Group tıkanmışken lag sayaçlarını izle — o sıçrama yavaş bir consumer değil, kısa süreliğine var olmayı bırakmış bir consumer group.',
          },
          {
            html: '<strong>Cooperative sticky</strong> rebalancing bunun çoğunu çözer. Her şeyi geri almak yerine önce yeni atamayı hesaplar ve sadece gerçekten el değiştiren partition\'ları alır. Consumer\'lar zaten sahip oldukları iş üzerinde çalışmaya devam eder, böylece tıkanma neredeyse sıfıra iner.',
          },
          {
            tone: 'danger',
            html: 'Tanınması gereken hata biçimi şu: bir batch\'i işlemek <code>max.poll.interval.ms</code> süresinden uzun sürerse broker consumer\'ı ölmüş sayıp gruptan atar. Bu bir rebalance tetikler, rebalance herkesi tıkar, tıkanma bir sonraki batch\'i daha da uzatır — ve artık elinde, gerçek problem yavaş bir handler\'ken cluster bozulmuş gibi görünen bir rebalance döngüsü vardır.',
          },
        ],
        predict: {
          question:
            'Eager bir group, producer yazmaya devam ederken 40 tick boyunca rebalance içinde tıkanıyor. Lag grafiği ne yapar?',
          options: [
            'Düz kalır — consumer yoksa lag da değişmez',
            'Yükselir, group oturunca keskin biçimde düşer',
            'Düşer, çünkü hiçbir şey okunmuyor',
          ],
          answer: 1,
          explanation:
            'Lag, yazılan kayıtlar eksi commit edilen kayıtlardır. Yazmalar sürer, commit\'ler durur; yani lag tıkanma boyunca yükselir ve ancak group devam edip birikmiş işi eritince geri iner.',
        },
        ui: {
          eager: 'Eager (stop the world)',
          cooperative: 'Cooperative sticky',
          addConsumer: 'Consumer ekle',
          stalled: 'Group tıkandı — rebalance sürüyor, hiçbir şey işlenmiyor',
          stable: 'Group stabil',
          lag: 'lag',
          rebalances: 'rebalance',
        },
      },

      offsets: {
        title: 'At-least-once bir karardır, ayar değil',
        lede: 'İki satır kodun sırası, bir mesajı kaybetmekle onu iki kez işlemek arasındaki tüm farktır.',
        prose: [
          {
            html: 'Offset bir yer imidir: group\'un işlediğini taahhüt ettiği pozisyon. Consumer\'lar ne okuduklarını değil, neyi bitirdiklerini takip eder — ve commit\'i işe göre nereye koyduğun, bir crash\'in sana neye mal olacağını belirler.',
          },
          {
            html: '<strong>İşlemeden önce commit</strong> sana at-most-once verir. Önce yer imi ilerler, sonra iş başlar. Ortada crash olursa o kaydı bir daha kimse okumaz, çünkü group onu çoktan bitmiş olarak kaydetmiştir. Siparişin parası sessizce hiç alınmaz.',
          },
          {
            html: '<strong>İşledikten sonra commit</strong> sana at-least-once verir. Önce iş yapılır, sonra yer imi ilerler. Arada crash olursa kayıt hâlâ beklemededir, yani partition\'ı devralan kim olursa onu yeniden çalıştırır — handler idempotent değilse müşteriden iki kez tahsilat yapılır.',
          },
          {
            tone: 'accent',
            html: 'Problemi ortadan kaldıran üçüncü bir seçenek yok. Kafka\'nın transactional producer\'ı sana <em>Kafka içinde</em> exactly-once verir — bir topic\'ten oku, bir topic\'e yaz, offset\'i atomik olarak commit et. Handler\'ın bir payment API\'sini çağırdığı anda at-least-once artı bir idempotency key\'e geri dönersin, çünkü o dış sistem transaction\'ın içinde değildir.',
          },
          {
            tone: 'muted',
            html: 'Bir commit modu seç, sonra consumer\'ı tam iş üzerindeyken öldür. Bunun maliyetini log sana söyleyecek.',
          },
        ],
        predict: {
          question:
            'İşledikten sonra commit ediyorsun. Bir consumer karttan çekim yapıyor, sonra commit etmeden ölüyor. Ne olur?',
          options: [
            'Çekim offset ile birlikte geri alınır',
            'Başka bir consumer kaydı replay eder ve tekrar çekim yapar',
            'Kafka duplicate\'i fark edip atlar',
          ],
          answer: 1,
          explanation:
            'Kafka handler\'ının ne yaptığını bilmez — sadece commit edilmemiş bir offset görür, yani kayıt hâlâ beklemededir ve yeniden teslim edilir. Broker hiç görmediği bir yan etkiyi deduplicate edemez. İdempotency key tam da bunun için var.',
        },
        ui: {
          commitFirst: 'Önce commit (at-most-once)',
          commitLast: 'Sonra commit (at-least-once)',
          killBusy: 'Çalışan consumer\'ı öldür',
          lost: 'kayıp',
          duplicated: 'iki kez işlendi',
        },
      },

      deadLetters: {
        title: 'Dead letter\'lar ve işi daha kötü yapan replay',
        lede: 'Kafka\'da dead-letter queue yok. Sıradan topic\'lerden kurulan bir konvansiyon — her ekibin biraz farklı kurmasının ve replay\'in sistemdeki en tehlikeli düğme olmasının sebebi de bu.',
        prose: [
          {
            html: 'Bu batch\'teki bir sipariş, handler\'ın reddettiği bir para birimi taşıyor. Kaç kez çalışırsa çalışsın asla başarılı olmayacak. Onunla ne yaptığın, elinde tek bir takılı sipariş mi yoksa takılı bir partition mı olacağını belirliyor.',
          },
          {
            html: '<strong>Yerinde retry</strong> akla ilk gelen yaklaşım ve yanlış olanı. Consumer başarısız kaydı commit etmeden tekrar tekrar çalıştırır, yani offset hiç ilerlemez — ve offset\'ler sırayla ilerlediği için arkasındaki her sağlıklı sipariş de bekler. Tek bir bozuk payload queue\'yu herkes için durdurur.',
          },
          {
            html: '<strong>Retry topic\'ine yönlendirmek</strong> tıkanmayı açar. Başarısız kayıt <code>orders.retry.5s</code> topic\'ine produce edilir, offset commit edilir ve ana partition akmaya devam eder. Zincir ona artan backoff ile iki şans daha verir; yine başarısız olursa tüm deneme geçmişi ekli olarak <code>orders.DLQ</code>\'ya düşer.',
          },
          {
            tone: 'danger',
            html: 'Sonra bir olayı döngüye çeviren kısım geliyor. DLQ\'yu ana topic\'e geri boşaltmak kurtarma gibi hissettirir ama mesajda değişen hiçbir şey yoktur. Yine başarısız olur, zinciri yine yürür ve tekrar DLQ\'ya düşer — üstelik yolda sağlıklı trafikle yarışır. <strong>Replay ancak hata düzeltildikten sonra işe yarar.</strong> Aşağıda yanlış sırayla dene ve sayacın geri geldiğini izle.',
          },
        ],
        predict: {
          question:
            'Bir kesintiden dolayı DLQ\'nda 12 bin mesaj var. Bug düzeltilip deploy edildi. Önce ne yaparsın?',
          options: [
            '12 binin tamamını hemen ana topic\'e geri boşaltırım',
            'Replay\'i dry-run ederim, neden başarısız olduklarına bakarım, sonra batch\'ler halinde boşaltırım',
            'DLQ topic\'ini silerim — mesajlar zaten bayat',
          ],
          answer: 1,
          explanation:
            'Bir DLQ\'daki her mesaj aynı sebeple başarısız olmaz ve replay edilen 12 bin kayıt aynı partition\'larda canlı trafikle yarışır. Hataya göre filtrele, düzeltmenin onları kapsadığını doğrula, kontrollü batch\'ler halinde replay et — ve hâlâ başarısız olanları ayrı tut.',
        },
        ui: {
          retryInPlace: 'Yerinde retry',
          retryTopic: 'Retry topic\'ine yönlendir',
          processed: 'işlendi',
          blocked: 'arkasında bloke',
          deadLetters: 'dead letter',
          attempts: 'deneme · öldüğü an t',
          dryRunBad: 'replay edilecek ve yine başarısız olacak — hata hâlâ orada.',
          dryRunGood: 'replay edilecek ve artık başarılı olmalı.',
          dryRunPrefix: 'Dry run:',
          replay: 'DLQ\'yu replay et',
          deployFix: 'Düzeltmeyi deploy et',
          toolNote:
            'Bunu gerçek bir cluster üzerinde yapmak {tool} işi — indexlenmiş dead letter\'lar, filtreli replay ve production\'a dokunmadan önce bir dry run.',
        },
      },
    },
  },
}
