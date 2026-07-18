import { REPOS } from './types'
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
    labs: [
      {
        path: '/kafka',
        topic: 'Apache Kafka',
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
      {
        path: '/hookkeep',
        topic: 'Webhook\'lar',
        title: 'Webhook\'lar ve nereye gittikleri',
        summary:
          'Sağlayıcı event\'i ilettiğini söylüyor. Senin veritabanının böyle bir event\'ten haberi yok. Bu iki gerçek arasındaki boşluk üzerine dört bölüm — ve çözümün neden sıkıcı olduğu: önce yaz.',
        topics: [
          'Persist-first ve forward-first',
          'Exponential backoff ve jitter neden şart',
          'Hâlâ replay edilebilen dead letter\'lar',
          'Reddedilen imzalar: kanıt, iş değil',
        ],
        cta: 'Lab\'ı aç',
      },
      {
        path: '/idempotency',
        topic: 'Idempotency',
        title: 'Aynı istek, iki kez',
        summary:
          'Ödeme timeout alıyor ve client tekrar deniyor. Key takmanın neden kolay yarı olduğu ve kontrol etmekle sahiplenmek arasındaki pencere üzerine dört bölüm.',
        topics: [
          'Timeout neden hiçbir şey söylemez',
          'Saklanan cevaplar ve Idempotent-Replay',
          'Önce-kontrol ile INSERT ... ON CONFLICT',
          'Fingerprint, 422 ve yanan key\'i serbest bırakmak',
        ],
        cta: 'Lab\'ı aç',
      },
    ],
  },

  kafka: {
    topic: 'Apache Kafka',
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
          {
            html: `Yukarıdakilerin hepsi davranış, araç değil — ama bunun tekrar tekrar yaşanmasının sebebi tam olarak araç eksikliği: bir DLQ topic'i size byte gösterir, mesajın neden düştüğünü ya da onu daha önce replay edip etmediğinizi değil. <a href="${REPOS.kafkaDlq}" target="_blank" rel="noreferrer noopener">kafka-dlq</a> bu bölümden doğan araç — dead letter'ları hata sebebine göre indexler, replay sonrası geri düşen bir mesajı <em>looping</em> diye işaretler ve arkasında dry-run planı olmayan bir replay'i reddeder.`,
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

  hookkeep: {
    topic: 'Webhook\'lar',
    title: 'Webhook\'lar ve nereye gittikleri',
    intro: [
      {
        html: 'Sağlayıcı sana bir event gönderiyor ve hızlıca 2xx bekliyor. Endpoint\'in yavaş, ya da restart oluyor, ya da kısa süreliğine düşük. Sağlayıcı birkaç kez deniyor, vazgeçiyor ve iletimi başarısız olarak işaretliyor — ya da daha kötüsü, başarılı olarak. Günler sonra biri hiç düşmemiş bir ödemeyi fark ediyor.',
      },
      {
        html: 'Asıl soru endpoint\'in neden düştüğü değil. Endpoint\'ler düşer. Soru şu: sonrasında elinde ne kaldı? Bunun cevabı aylar önce yazdığın tek bir sıralama satırında belli olmuştu — event, sağlayıcıya "tamamdır" demeden önce mi yoksa sonra mı kendi deponuza yazıldı?',
      },
      {
        tone: 'muted',
        html: 'Bu tamamen tarayıcında çalışıyor. Sunucu da yok, network çağrısı da: <code>hookkeep</code>\'in deterministik bir modeli, yani aynı seed hep aynı incident\'ı oynatıyor. Status isimleri gerçek şemadan alındı.',
      },
    ],
    nav: ['Önce yaz', 'Retry', 'Replay', 'İmzalar'],

    sections: {
      persistFirst: {
        title: 'Webhook nereye gitti?',
        lede: 'Sağlayıcının panosunda 200 yazıyor. Senin veritabanının bu event\'ten haberi yok. İkisi de doğru söylüyor.',
        prose: [
          {
            html: 'Bir webhook alıcısının iki işi var ve bunları hangi sırayla yaptığı tasarımın tamamı. Sağlayıcıya cevap vermek zorunda, bir de event\'i kalıcı hale getirmek. Sırayı ters yaparsan tutamayacağın bir söz vermiş olursun.',
          },
          {
            html: '<strong>Forward-first</strong> doğal görünür: event\'i al, işleyecek olana ver, o başarılı olunca yaz. Verimli bile hissettirir — birazdan işin biteceği bir şeyi neden saklayasın? Sorun <em>sonra</em> kelimesinde. Ack ile yazma arasındaki her şey yalnızca bellekte duruyor ve bir deploy senin belleğini beklemez.',
          },
          {
            tone: 'danger',
            html: 'Process o aralıkta ölürse event gecikmez — <strong>yok olur</strong>. Sağlayıcı 2xx\'ini çoktan aldı, yani denemeyi bıraktı. Bir daha kimse göndermeyecek. Sağlayıcının suçu sanılan hata budur ve sağlayıcının suçu değildir.',
          },
          {
            html: '<strong>Persist-first</strong> sıkıcı olan alternatif ve <code>hookkeep</code>\'in seçtiği yol: ham body\'yi ve header\'ları Postgres\'e yaz, ancak ondan sonra cevap ver. O yazma başarısız olursa 500 dönersin — asla sahte bir 200 değil — ve sağlayıcı tekrar dener; retry mantığı zaten tam olarak bunun için var.',
          },
          {
            tone: 'accent',
            html: 'İzlenecek sayaç <strong>risk altında</strong>: sağlayıcının iletildiğine inandığı ama diskte hiçbir yerde bulunmayan event\'ler. Persist-first\'te bu yapısal olarak sıfırdır. İddianın tamamı bu.',
          },
        ],
        predict: {
          question:
            'Forward-first modunda, bir event iletilirken process restart oluyor. Sağlayıcı ne yapar?',
          options: [
            'Tekrar dener, çünkü iletim hiç tamamlanmadı',
            'Hiçbir şey — zaten 200 aldı ve event\'i iletilmiş sayıyor',
            'Event\'i bir dead-letter endpoint\'ine gönderir',
          ],
          answer: 1,
          explanation:
            'Ack en başta gönderildi, yani sağlayıcı açısından iş bitti. Seni kurtaracak olan şey — retry mekanizması — kendi 200\'ün tarafından kapatıldı.',
        },
        ui: {
          modeLabel: 'Yazma sırası',
          persistFirst: 'Önce yaz',
          forwardFirst: 'Önce ilet',
          crash: 'Process\'i restart et',
          stored: 'Diskte',
          delivered: 'İletildi',
          atRisk: 'Risk altında',
          lost: 'Tamamen kayıp',
          providerView: 'Sağlayıcının sandığı',
          ourView: 'Gerçekte elindeki',
        },
      },

      retryBackoff: {
        title: 'Endpoint düştü. Şimdi ne olacak?',
        lede: 'Tekrar denemek kolay. Toparlanmanı ikinci bir kesintiye çevirmeden denemek, atlanan kısım.',
        prose: [
          {
            html: 'Endpoint\'i düşür ve denemeleri izle. Aralık sabit kalmıyor — ikiye katlanıyor: <code>base * 2^(attempt-1)</code>, haftaya sarkmasın diye bir tavanla sınırlı. Zorlanan bir downstream daha seyrek darbe alıyor, daha sık değil; naif bir retry döngüsünün yaptığının tam tersi.',
          },
          {
            html: 'Süs gibi duran kısım <strong>jitter</strong>, her aralıkta ±%20. O olmadan aynı kesinti sırasında başarısız olan bütün iletimler aynı anda geri geliyor. Endpoint toparlanıyor, tüm birikmiş yükü tek bir sivri uç olarak alıyor ve yeniden yıkılıyor — üstelik artık tüm filo senkronize olduğu için bu her retry turunda tekrarlanıyor.',
          },
          {
            html: 'Yapılandırılan deneme sayısı dolunca iletim <code>dead</code> olarak işaretleniyor. Bu kelime yanlış anlaşılıyor, o yüzden açık olalım: dead, atıldı demek değil. Satır duruyor, body duruyor, üçüncü bölüm de zaten onu geri getirmekle ilgili.',
          },
          {
            tone: 'warn',
            html: 'Asıl kötü durum <code>down</code> değil — <code>slow</code>. Bir timeout, endpoint\'in cevap vermeyi bırakmadan önce isteği işleyip işlemediği hakkında sana hiçbir şey söylemez. Tekrar denemek duplicate olabilir, dememek kayıp olabilir. Event id\'sinin her iletimle birlikte gitmesinin sebebi bu: alıcı dedup yapar, gönderen de tahmin etmek zorunda kalmaz.',
          },
        ],
        predict: {
          question: 'Zaten exponential olan bir backoff\'a neden rastgele jitter eklenir?',
          options: [
            'Denemeleri bir saldırgan için tahmin edilemez kılmak için',
            'Birlikte başarısız olan iletimler birlikte denemesin, endpoint\'i yeniden kırmasın diye',
            'Yükü worker process\'lere eşit dağıtmak için',
          ],
          answer: 1,
          explanation:
            'Ortak bir kesinti, başarısız olan tüm iletimleri aynı takvime senkronize eder. Jitter bu aynı adımlılığı bozar; toparlanma tek bir sürü hâlinde değil, yayılarak gelir.',
        },
        ui: {
          endpointLabel: 'Endpoint',
          up: 'Ayakta',
          slow: 'Yavaş',
          down: 'Düşük',
          delivered: 'İletildi',
          retrying: 'Tekrar deniyor',
          dead: 'Dead',
          attempts: 'deneme',
          nextIn: 'sonraki deneme',
          waiting: 'bekliyor',
        },
      },

      replay: {
        title: 'Replay: yalnızca senin yapabileceğin kısım',
        lede: 'Sağlayıcı günler önce denemeyi bıraktı. Event hâlâ duruyor — çünkü kopya senin.',
        prose: [
          {
            html: 'Endpoint\'i geri getir ve dead iletimleri replay et. Boşluk kapanıyor. Bunda kayda değer hiçbir şey yok, asıl mesele de bu: veri hiç kaybolmadıysa toparlanma olaysız geçer.',
          },
          {
            html: 'Alternatifiyle karşılaştır. Event hiç kalıcı hale getirilmediyse çalıştıracak bir replay de yok — sağlayıcı çoktan yoluna gitti, retry penceresi kapandı ve geriye kalan tek yol bir şirkete geçen salıdan kalma bir şeyi yeniden göndermesini rica eden bir destek talebi. Önce yazmak, bir incident\'ı angaryaya çeviren şeydir.',
          },
          {
            tone: 'warn',
            html: 'Replay at-least-once\'tır ve bunun için özür dilemez: zaten başarılı olmuş event\'leri de yeniden gönderir, çünkü consumer\'ının onlarla ne yaptığını bilemez. Her iletim, alıcının dedup yapabilmesi için event id\'sini bir header\'da taşır. Handler\'ın idempotent değilse, bunu replay sırasında öğrenirsin.',
          },
          {
            tone: 'accent',
            html: 'Ateşlemeden önce dry-run yap. Endpoint hâlâ bozukken çalıştırılan bir replay hiçbir şeyi düzeltmez — aynı iletimleri tekrar <code>dead</code> durumuna yürütür ve orijinal zaman damgalarını taze bir başarısızlık turunun altına gömer.',
          },
        ],
        predict: {
          question: 'Endpoint hâlâ düşükken dead iletimleri yine de replay ediyorsun. Sonra?',
          options: [
            'Kuyruğa girip endpoint toparlanınca iletilirler',
            'Denemelerini yeniden tüketip tekrar dead olurlar',
            'Endpoint sağlıksızken replay çalışmayı reddeder',
          ],
          answer: 1,
          explanation:
            'Replay yeniden kuyruğa alır; dünyanın düzelmesini beklemez. Hiçbir şey düzelmediği için aynı denemeler aynı şekilde başarısız olur. Önce düzelt, sonra replay et — dersin tamamı bu sıralama.',
        },
        ui: {
          replay: 'Dead iletimleri replay et',
          bringUp: 'Endpoint\'i ayağa kaldır',
          dryRunPrefix: 'Dry run:',
          dryRunGood: 'replay edilecek ve artık başarılı olmalı.',
          dryRunBad: 'replay edilecek — endpoint hâlâ sağlıksız, yani yine ölecekler.',
          dead: 'Dead',
          delivered: 'İletildi',
          replayed: 'replay ile',
          toolNote:
            'Bunu gerçek trafik üzerinde çalıştırmak {tool} işi — her event ham body\'siyle saklanır, id ya da zaman aralığıyla replay edilir ve production\'a dokunmadan önce dry run alınır.',
        },
      },

      signature: {
        title: 'Doğrulanmayan bir imza',
        lede: 'Biri webhook URL\'ine istek atıyor. Adres public, elbette atabilir. Ne saklanmalı, ne çalıştırılmalı?',
        prose: [
          {
            html: 'Ingest endpoint\'inin sağlayıcı tarafından erişilebilir olması gerekir, bu da herkes tarafından erişilebilir olması demektir. Kimlik doğrulaması imzadır: paylaşılan bir secret ile ham body üzerinde HMAC, sağlayıcının belirlediği bir header\'da — <code>Stripe-Signature</code>, <code>X-Hub-Signature-256</code>, vesaire.',
          },
          {
            html: 'Doğrulanmadığında iki akla yatkın tepki var ve ikisi de yanlış. Yine de işlemek güvenlik açığı. Çöpe atmak ise adli olanı: açıklanamayan sahte bir istek, sonrasında tam olarak bakmak isteyeceğin şeydir ve sildiğin şeye bakamazsın.',
          },
          {
            tone: 'accent',
            html: 'Bu yüzden event <strong>saklanıyor</strong>: <code>verify_status = rejected</code> ve bir sebep, isteği yapana 401, oluşturulan delivery satırı yok. Kanıt olarak tutulur, iş olarak asla ele alınmaz. Bunlar ayrı kararlar ve şema onları ayrı eksenlerde tutuyor: <code>verify_status</code> <em>bu gerçek mi</em> sorusuna, <code>deliveries.status</code> <em>ulaştı mı</em> sorusuna cevap veriyor.',
          },
          {
            tone: 'warn',
            html: 'Aralık replay\'i rejected event\'leri bilerek atlar. Bir zaman penceresini süpürürken sağlayıcıdan geldiği kanıtlanamayan bir payload üzerinde kazara işlem yapmak, varsayılan olarak elinin altında olmasını isteyeceğin bir hata değil.',
          },
        ],
        predict: {
          question: 'Doğrulanmayan bir imzayla istek geldi. Bu isteğe ne olur?',
          options: [
            'Reddedilir ve atılır — hiçbir şey yazılmaz',
            'Rejected kanıt olarak saklanır, 401 döner, asla iletilmez',
            'Saklanır ve iletilir, log\'a bir uyarı düşülür',
          ],
          answer: 1,
          explanation:
            'Saklamak ile çalıştırmak ayrı kararlardır. İnceleme sırasında lazım olacağı için tutulur, nereden geldiği kanıtlanamadığı için asla kuyruğa alınmaz.',
        },
        ui: {
          verifierLabel: 'İmza doğrulama',
          verifierOn: 'Tanımlı',
          verifierOff: 'Bu source için yok',
          verified: 'Doğrulandı',
          unverified: 'Doğrulanmamış',
          rejected: 'Reddedildi',
          delivered: 'İletildi',
          evidence: 'Kanıt olarak saklandı, delivery satırı yok',
          reason: 'sebep',
        },
      },
    },
  },

  idempotency: {
    topic: 'Idempotency',
    title: 'Aynı istek, iki kez',
    intro: [
      {
        html: 'Bir ödeme isteği timeout aldı. Client tahsilatın gerçekleşip gerçekleşmediğini bilmiyor — timeout bir cevap değil, cevabın yokluğu — ve yapılabilecek tek makul şeyi yapıp tekrar deniyor. Müşteri az önce iki kez mi ödedi?',
      },
      {
        html: 'Neredeyse herkes aynı çözüme uzanıyor: bir key tak, daha önce görüp görmediğine bak. O kısım kolay ve işlerin bozulduğu yer orası değil. İşler kontrol etmekle sahiplenmek arasındaki boşlukta bozuluyor; o boşluk da iki istek aynı milisaniyede gelene kadar görünmüyor.',
      },
      {
        tone: 'muted',
        html: 'Bu tamamen tarayıcında çalışıyor. Sunucu da yok, network çağrısı da: <code>go-idempotent</code>\'in deterministik bir modeli, yani aynı seed hep aynı incident\'ı oynatıyor. Status kodları ve state isimleri kütüphanenin gerçekten döndürdükleri.',
      },
    ],
    nav: ['Korumasız', 'Key ile', 'Yarış', 'Aynı key, yeni body'],

    sections: {
      unprotected: {
        title: 'İki kez tahsil eden retry',
        lede: 'Burada bozuk hiçbir şey yok. Network yavaş, client düzgün davranıyor ve müşteriden iki kez para çekiliyor.',
        prose: [
          {
            html: 'Sırayı izle. İstek geliyor, handler çalışmaya başlıyor ve client\'ın beklemeye razı olduğundan daha uzun sürüyor. Client timeout alıp tekrar deniyor — doğru olan da bu, çünkü onun bulunduğu yerden bakınca istek hiç ulaşmamış bile olabilir.',
          },
          {
            tone: 'danger',
            html: 'İlk istek hiçbir zaman iptal edilmedi. Client timeout\'u bir bağlantıyı kapatır; sunucunun içine uzanıp işi durdurmaz. Yani iki istek de çalışıyor, ikisi de başarılı oluyor, ikisi de tahsil ediyor. <strong>İki tahsilat, iki tane 201 ve log\'larında hiçbir hata yok.</strong>',
          },
          {
            html: 'Retry ile idempotency\'nin aynı konuşma olmasının sebebi bu. Tekrar deneyen her client — her HTTP kütüphanesi, her job runner, webhook\'unu çağıran her ödeme sağlayıcısı — "en az bir kez"i senin problemin haline getiriyor. Network teslimatı en az bir kez garantiliyor; ikincisini zararsız kılabilecek tek kişi sensin.',
          },
          {
            tone: 'accent',
            html: 'Timeout\'un sana ne söyle<em>me</em>diğine dikkat et: işin olup olmadığını. Eksik olan o tek bit\'lik bilgi bu bölümün tüm varlık sebebi, ve hiçbir retry ayarı onu geri getirmiyor.',
          },
        ],
        predict: {
          question:
            'Client 12 tick sonra timeout alıyor; handler 24 tick\'e ihtiyaç duyuyor. 13. tick\'te ne olmuş durumda?',
          options: [
            'Client bağlantıyı kapatınca istek iptal edildi',
            'Handler hâlâ çalışıyor ve karttan çekecek',
            'Kimse dinlemediği için handler rollback yaptı',
          ],
          answer: 1,
          explanation:
            'Handler\'a birinin beklemeyi bıraktığını söyleyen hiçbir şey yok. İşi bitiriyor ve tahsilatı commit ediyor — hem de çoktan vazgeçmiş ve isteği birazdan yeniden gönderecek bir client\'a.',
        },
        ui: {
          send: 'Ödemeyi gönder',
          retry: 'Client tekrar deniyor',
          charges: 'Tahsilat',
          total: 'Toplam kesilen',
          requests: 'İstekler',
          timedOut: 'timeout aldı',
          processing: 'handler çalışıyor',
          doubleCharged: 'Tek sipariş için müşteriden iki kez tahsil edildi.',
        },
      },

      withKey: {
        title: 'Bir key ve saklanan bir cevap',
        lede: 'Çözüm ikinci isteği engellemek değil. İkinci isteği zararsız kılmak.',
        prose: [
          {
            html: 'Client key\'i bir kez üretiyor — deneme başına değil, ödeme başına — ve o ödemenin her denemesinde <code>Idempotency-Key</code> olarak gönderiyor. Sunucu da key\'i ürettiği cevapla birlikte saklıyor.',
          },
          {
            html: 'Artık retry handler\'ı çalıştırmıyor. Tamamlanmış bir satır buluyor, saklanan status kodunu ve body\'yi birebir tekrar oynatıyor ve çağıranın bunu taze bir çalıştırmadan ayırt edebilmesi için <code>Idempotent-Replay: true</code> ekliyor. Tek tahsilat, üstelik client cevabını da alıyor — ilk seferde kaçırdığı tahsilat id\'si dahil, <em>aynı</em> cevabı.',
          },
          {
            tone: 'warn',
            html: 'Düğmeye basıp görmeye değer bir zamanlama inceliği var: retry ilk istek <em>hâlâ çalışırken</em> gelirse ortada saklanmış bir cevap yoktur, yani tekrar oynatılacak bir şey de yoktur. Kütüphane bunun yerine <code>409</code> döner. Fazla aceleci retry sana cevabı değil, bir conflict\'i getirir.',
          },
          {
            tone: 'accent',
            html: 'Key client\'a aittir ve bu bir implementasyon detayı değil. İki HTTP isteğinin aynı niyet olduğunu yalnızca çağıran bilir — sunucu birbirinin aynı görünen iki payload görür ve bir retry ile aynı şeyi meşru şekilde iki kez satın alan bir müşteriyi ayırt edemez.',
          },
        ],
        predict: {
          question: 'Retry, 24 tick süren ilk isteğin 4 tick ardından geliyor. Geri ne döner?',
          options: [
            'Saklanan cevap, tekrar oynatılmış hâlde',
            '409 — ilk istek henüz oynatılacak bir şey commit etmedi',
            'İlk istek bitene kadar bekler, sonra onun cevabını döner',
          ],
          answer: 1,
          explanation:
            'Saklanan cevap ancak handler commit ettikten sonra var olur. O ana kadar satır in_flight\'tır ve kütüphane bağlantıyı açık tutmak yerine anında 409 döner.',
        },
        ui: {
          send: 'Ödemeyi gönder',
          retry: 'Client tekrar deniyor',
          retryEarly: 'Hemen tekrar dene',
          charges: 'Tahsilat',
          total: 'Toplam kesilen',
          requests: 'İstekler',
          replayed: 'store\'dan oynatıldı',
          storeLabel: 'idempotency_keys',
          fresh: 'handler çalıştı',
        },
      },

      race: {
        title: 'İki istek, aynı milisaniye',
        lede: 'Önce-kontrol-sonra-sahiplen, elle test ettiğin her seferinde doğru; production sana ilk kez iki tane aynı anda gönderdiğinde yanlış.',
        prose: [
          {
            html: 'Akla gelen ilk implementasyon önce okur: key\'e bak, yoksa sahiplen ve çalıştır. Sıralı gittiğinde kusursuzdur — önceki bölümdeki her retry yine yakalanırdı.',
          },
          {
            tone: 'danger',
            html: 'Ama okuma ile yazma iki ayrı ifade ve aralarında bir pencere var. İki istek de, hiçbiri yazmadan önce <em>burada bir şey yok</em> okuyabilir. Sonra ikisi de key\'i sahipleniyor, ikisi de handler\'ı çalıştırıyor ve yine iki tahsilattasın — hem de idempotency kodu tam orada, stack trace\'te, görünüşe göre işini yaparken.',
          },
          {
            html: 'Çözüm bir lock, mutex ya da queue değil. İkisini birden yapan tek bir ifade: <code>INSERT ... ON CONFLICT (key) DO NOTHING</code>. Bir satırı etkileyen sahiplenmeyi kazanmıştır; sıfır satır etkileyen kaybetmiştir ve kazananın yazdığını okur. Burada hakem zaten hep veritabanı olacaktı — bu sadece aksini varsaymayı bırakıyor.',
          },
          {
            tone: 'accent',
            html: 'Kaybeden, kazanan bitene kadar park edilmek yerine anında <code>409</code> alıyor. Bağlantıyı tutmak daha hoş bir cevap verirdi, ama aynı zamanda yavaş bir handler\'ın artık bir yerine iki socket işgal etmesi demek; ve retry akını da tutulan bağlantı akınına dönüşür. Hızlı başarısız olmak daha ucuz takas.',
          },
        ],
        predict: {
          question:
            'İki istek aynı anda geliyor ve endpoint önce-kontrol-sonra-sahiplen kullanıyor. Kaç tahsilat olur?',
          options: [
            'Bir — key ikisi de çalışmadan önce kontrol ediliyor',
            'İki — ikisi de hiçbiri yazmadan önce boş store okuyor',
            'Hiç — çakışan yazmalar birbirini iptal ediyor',
          ],
          answer: 1,
          explanation:
            'Kontrol ikisi için de geçti, çünkü her biri baktığı anda key gerçekten orada değildi. O pencereyi kapatan şey kontrolün kendisi değil, atomiklik.',
        },
        ui: {
          protection: 'Sahiplenme stratejisi',
          readThenWrite: 'Kontrol et, sonra sahiplen',
          insertOnConflict: 'INSERT ... ON CONFLICT',
          sendBoth: 'İkisini aynı anda gönder',
          charges: 'Tahsilat',
          total: 'Toplam kesilen',
          requests: 'İstekler',
          won: 'satırı kazandı',
          lost: 'satırı kaybetti',
          toolNote:
            'Bunu yapan middleware — atomik sahiplenme, saklanan cevap, replay header\'ı — {tool}. Arkasındaki Postgres store\'u ise hakemliği primary key\'e yaptıran tek bir tablo.',
        },
      },

      fingerprint: {
        title: 'Aynı key, farklı body',
        lede: 'Asla karıştırılmaması gereken iki şey: bir isteğin retry\'ı ile onun key\'ini takmış farklı bir istek.',
        prose: [
          {
            html: 'İki isteğin aynı olduğunu kanıtlamaya tek başına bir key yetmez. Client\'lar key\'leri kazara tekrar kullanır — ilerlemeyen bir döngü değişkeni, cache\'lenmiş bir header, kopyala-yapıştır bir curl. Sunucu körlemesine tekrar oynatsaydı, 999 TRY ödeyen bir müşteri 249,90 TRY\'lik tahsilatın saklanmış cevabını alır ve büyük ödemenin başarılı olduğunu sanırdı.',
          },
          {
            html: 'Bu yüzden saklanan satır bir fingerprint de tutuyor: request body\'sinin SHA-256\'sı. İsabet olduğunda body\'nin eşleşmesi gerekiyor. Eşleşmezse cevap <code>422</code> — <em>idempotency key reused with a different request</em> — ve hiçbir şey oynatılmıyor, hiçbir şey tahsil edilmiyor. Uyuşmazlık çağıranın hatası ve ona sessizce başkasının makbuzu uzatılmak yerine bu söyleniyor.',
          },
          {
            tone: 'accent',
            html: 'İşin doğru yapılmasının diğer yarısı handler <strong>başarısız olduğunda</strong> ne olduğu. Key iş başlamadan önce sahiplenildiği için naif bir implementasyon arkada sonsuza kadar <code>in_flight</code> bir satır bırakır ve sonraki her retry 409 alır — endpoint hiç gerçekleşmemiş bir ödemeye karşı kendini kilitlemiştir.',
          },
          {
            html: 'Middleware, handler commit etmediğinde key\'i serbest bırakıyor. Başarısız bir istek key\'ini yakmamalı: retry\'ın bütün anlamı, bir sonraki denemenin hâlâ başarılı olabilmesi. Handler hatasını aç, bir istek gönder, sonra kapat ve tekrar dene — tahsilat geçiyor.',
          },
        ],
        predict: {
          question:
            'Handler, key sahiplenildikten sonra ama herhangi bir tahsilat öncesinde çöküyor. Satıra ne olmalı?',
          options: [
            'in_flight kalmalı ki istek tekrarlanamasın',
            'Serbest bırakılmalı ki aynı key\'le retry hâlâ başarılı olabilsin',
            'Hata cevabı saklanarak completed işaretlenmeli',
          ],
          answer: 1,
          explanation:
            'Hiçbir şey olmadı, dolayısıyla hiçbir şey hatırlanmamalı. Satırı sahiplenilmiş bırakmak geçici bir hatayı kalıcı yapardı — sonraki her retry, hiç yapılmamış bir iş için 409 alırdı.',
        },
        ui: {
          sendOriginal: '249,90 öde',
          sendDifferent: 'Aynı key\'i 999,00 için kullan',
          failToggle: 'Handler başarısız',
          retry: 'Aynı key\'le tekrar dene',
          charges: 'Tahsilat',
          total: 'Toplam kesilen',
          requests: 'İstekler',
          storeLabel: 'idempotency_keys',
          released: 'key serbest bırakıldı',
          empty: 'satır yok',
        },
      },
    },
  },
}
