/* Editorial reading paths based on methodology.md and reader-notes.json.
 * Groups organize the explanation; they do not add a research model or score.
 * Field links resolve against the current dataset, so no workbook values live here.
 */
const READING_GUIDE = {
  groups: [
    {
      id: 'capability',
      title: '形成行动能力',
      intro: '从生产与积累出发，看知识、技术和对外联系，再看军事力量与动员。三个领域共同帮助理解一个实体已经形成怎样的行动基础。',
      domains: ['politics', 'economy', 'military']
    },
    {
      id: 'supply',
      title: '维持基础供给',
      intro: '人需要食物和水，生产需要能源和原料。把供给放回本地需求中阅读，才能理解资源规模、自给条件和外部依赖各自意味着什么。',
      domains: ['agriculture', 'energy', 'minerals']
    },
    {
      id: 'organization',
      title: '连接与持续组织',
      intro: '资源需要运到使用它的地方，人口和生产也需要持续协调。交通观察连接与运行，稳定观察在长期压力下维持组织的条件。',
      domains: ['transport', 'stability']
    }
  ],
  domains: {
    politics: {
      question: '知识、技术与对外联系怎样支持行动？',
      intro: '当前工作簿的“政治”覆盖人口质量、科研、工业竞争力，以及外交、金融和企业网络。它帮助读者在经济与军事规模之外，观察健康教育、技术积累和跨境组织条件。阅读时应回到这些具体内容，理解原表领域名次所概括的能力。',
      connections: '科研和人口质量联系生产能力，外交、金融与企业网络补充跨境行动条件，可与经济规模一起阅读。',
      facets: [
        {
          title: '人口条件与知识投入',
          text: '人类发展指数提供健康、教育等人口条件的线索；科研投入观察资源向知识和工程技术的持续投入。现有记录没有把前者重算为单独的教育医疗指数。',
          fields: ['politics-F', 'politics-H']
        },
        {
          title: '工业与企业的组织能力',
          text: '工业竞争力同时关注制造规模、技术结构和市场位置。跨国公司则提供企业组织跨境资本、生产与市场的线索，两者补充单看产出总量的视角。',
          fields: ['politics-L', 'politics-M']
        },
        {
          title: '外交网络与金融联系',
          text: '大使馆观察持续处理跨国事务的网络，IMF投票观察特定国际制度中的正式权重，外汇储备和主权基金观察外部支付与资产配置条件。各字段覆盖的范围不同。',
          fields: ['politics-J', 'politics-I', 'politics-N']
        }
      ]
    },
    economy: {
      question: '当前产出与长期积累提供了怎样的生产基础？',
      intro: '经济领域把年度产出与已经积累的资产、资本放在一起，再结合用电、就业和增长观察生产基础。流量说明当期活动，存量补充过去形成的条件。多种读数互相补充，帮助理解一个实体可以持续调动怎样的经济资源。',
      connections: '生产需要能源和原料，也依赖交通连接；经济规模为军事投入与动员提供基础，知识和技术影响资源转化。',
      facets: [
        {
          title: '年度产出与实际运行',
          text: '名义GDP与购买力平价GDP分别提供跨境购买和国内生产规模的观察角度。用电量补充工业、居民及数字基础设施的运行线索，不能单独等同于生产效率。',
          fields: ['economy-G', 'economy-E', 'economy-O']
        },
        {
          title: '已经形成的积累',
          text: '国内资产、国民财富和资本存量分别补充年度产出。机器、厂房与基础设施更接近现实生产条件，广义财富还涉及其他积累；各列范围与年份须分别核对，不能直接相加。',
          fields: ['economy-I', 'economy-K', 'economy-M']
        },
        {
          title: '劳动规模与变化方向',
          text: '就业人口观察当前参与生产的规模，总人口补充市场和动员基础。较长时期增长提供变化方向，但各增长字段的算法不同，需要沿各自公式理解。',
          fields: ['economy-T', 'economy-V', 'economy-Q', 'economy-R']
        }
      ]
    },
    military: {
      question: '作战力量怎样获得持续行动与补充的条件？',
      intro: '军事领域关注一个实体在自身地理和战略目标下发起、承受并长期维持全面战争的能力。海军、空军、陆军与动员分别提供观察角度。装备、兵员和投入是规模线索，质量、补给、地理与战略环境也参与作者判断。',
      connections: '长期军事行动联系生产补充、能源原料、运输保障与人口组织，因此军事读数需要放回经济和基础条件中理解。',
      facets: [
        {
          title: '海上平台与不同任务',
          text: '吨位观察平台总体规模，航空作战舰艇及舰载机、垂发单元、潜艇分别补充航空、防空打击与水下力量。组合字段的点后部分保留记录含义，特殊标记仍需核对。',
          fields: ['military-C', 'military-K', 'military-J', 'military-L', 'military-M']
        },
        {
          title: '空中行动、信息与投送',
          text: '防空反导、卫星、军机和运输机分别观察防御、侦察通信、作战规模及远距离投送。军机与运输机的包含关系未完整说明，拆分记录不能相加制造新的飞机总数。',
          fields: ['military-D', 'military-N', 'military-O', 'military-P']
        },
        {
          title: '地面力量与长期动员',
          text: '兵力和坦克、火炮提供人员、突击及持续火力的线索。动员另看人口、生产、纵深与威慑条件；军费和单兵投入帮助理解装备、训练及保障的投入。',
          fields: ['military-E', 'military-I', 'military-Q', 'military-R', 'military-F', 'military-H', 'military-V']
        }
      ]
    },
    agriculture: {
      question: '食物、水和生物资源能怎样持续供给？',
      intro: '农业领域围绕危机中的基本供给，把食物、水、纤维和木材放在一起观察。当前总产量、人均供给与土地和技术条件下的潜力回答不同问题。阅读既要看已经提供多少，也要看需求、用水压力及可能的扩产空间。',
      connections: '农业供给联系水资源、能源、肥料原料和运输条件；食品之外的纤维与木材也支撑基本生活和生产。',
      facets: [
        {
          title: '总供给与人均基础',
          text: '谷物总产量、人均谷物和每日热量分别观察规模、人均条件与热量情况。肉类折粮补充食物的替代热量，所表示的并非生产肉类消耗的饲料量。',
          fields: ['agriculture-E', 'agriculture-F', 'agriculture-N', 'agriculture-H']
        },
        {
          title: '土地、产量与扩产空间',
          text: '耕地面积和单位面积产量共同描述生产条件，最大人均产量用于观察潜力。作物组合、轮作和技术假设未完整列出，这一潜力字段不能作为确定的未来产量。',
          fields: ['agriculture-C', 'agriculture-G', 'agriculture-D']
        },
        {
          title: '水与食品以外的供给',
          text: '境内水、外部来水和取水量帮助观察用水压力，淡化提供补充供给的线索。纤维作物与林地补充衣物和木材条件；水源自给相关字段须结合原公式读数。',
          fields: ['agriculture-Q', 'agriculture-R', 'agriculture-U', 'agriculture-W', 'agriculture-V', 'agriculture-K', 'agriculture-M']
        }
      ]
    },
    energy: {
      question: '现有能源供给与较长期资源基础是否支撑需求？',
      intro: '能源领域把油、气、煤的生产、储量和消费联系起来，再观察核电与可再生发电的补充。产量描述当前供给，储量提供较长期基础，消费决定本地需求。比较自给条件时，需要同时理解这些读数及不同能源的使用情况。',
      connections: '能源支撑生产、运输与基本运行，矿产中的核燃料和材料条件也与供电相连；供给应结合当地需求解释。',
      facets: [
        {
          title: '供给要放回需求中看',
          text: '油、气、煤的产量与消费分别描述可提供多少、当地需要多少。自给率连接生产和需求，帮助观察外部依赖；不使用某种能源与使用却短缺需要分别理解。',
          fields: ['energy-W', 'energy-Y', 'energy-Q', 'energy-S', 'energy-T', 'energy-V', 'energy-G', 'energy-M']
        },
        {
          title: '储量与当前开采速度',
          text: '储量补充当期产出的长期资源背景，储采年限把储量与当前生产速度联系起来。该比值不是资源必然耗尽的日期，原表除零错误也不能解释为零年。',
          fields: ['energy-X', 'energy-R', 'energy-U', 'energy-H', 'energy-N']
        },
        {
          title: '供电来源的补充',
          text: '核电和可再生发电提供化石燃料之外的供电条件。它们帮助理解发电环节的供给，但发电构成与全部能源消费构成不同，“其他占比”的组成仍未完整注明。',
          fields: ['energy-F', 'energy-E', 'energy-D']
        }
      ]
    },
    minerals: {
      question: '工业持续生产所需的原料是否齐备？',
      intro: '矿产领域观察工业原料的品类覆盖、供给、自给及外部依赖。铁、铜、铝等基础材料和用途不同的矿产，共同构成持续生产的原料条件。读者应结合材料用途与需求理解字段，单看某一种资源的规模无法概括完整供给。',
      connections: '矿产把基础供给与制造、能源和农业联系起来：金属支撑装备与电网，核燃料和肥料原料支撑其他供给。',
      facets: [
        {
          title: '基础建设与工业材料',
          text: '铁提供钢铁原料，铜联系电网、电机和电子设备，铝补充轻质结构材料。不同材料服务不同生产环节；原表两列同名“铝”的口径尚未区分，应分别保留。',
          fields: ['minerals-C', 'minerals-D', 'minerals-E', 'minerals-Z']
        },
        {
          title: '性能与专门用途',
          text: '铬和镍补充合金等材料条件，钛联系航空航天材料，锂联系电池。用途说明帮助理解为什么观察这些原料，不能据资源读数直接推出成品产能或技术水平。',
          fields: ['minerals-F', 'minerals-H', 'minerals-I', 'minerals-K']
        },
        {
          title: '能源与农业的原料基础',
          text: '铀联系核燃料，磷和钾联系主要肥料原料。这些字段让读者看到供给领域之间的联系；资源条件与实际开采、加工和使用能力仍需分别理解。',
          fields: ['minerals-P', 'minerals-Q', 'minerals-R']
        }
      ]
    },
    transport: {
      question: '人员、货物与信息能否有效连接？',
      intro: '交通领域既看道路、铁路、机场与水道构成的连接，也看车辆、网络和物流运行。长度与密度描述覆盖，载具和组织效率补充实际使用条件。不同方式承担末端连接、大宗运输和快速投送等任务，需要放在一起阅读。',
      connections: '交通连接资源、人口与生产地点，也关系军事补给和日常供给；网络覆盖、载具与组织效率共同提供观察线索。',
      facets: [
        {
          title: '覆盖与运输骨架',
          text: '道路连接居民和生产地点，铁路补充长距离重载，机场补充快速连接。密度使用的国土面积含作者对有效国土的估计，应结合相应口径解释。',
          fields: ['transport-F', 'transport-G', 'transport-I', 'transport-J', 'transport-L', 'transport-M', 'transport-V']
        },
        {
          title: '载具与水运条件',
          text: '汽车数量补充道路之外的载具基础，内河航道提供大宗水运条件。已有网络与实际运力是不同问题，“通航比”的具体含义还需查看原表公式。',
          fields: ['transport-O', 'transport-P', 'transport-R', 'transport-T']
        },
        {
          title: '信息连接与运行效率',
          text: '网络字段观察信息连接，物流绩效补充海关、追踪、组织和时效。它们帮助读者在设施规模之外，理解生产与运输能否有效协调。',
          fields: ['transport-D', 'transport-E', 'transport-C']
        }
      ]
    },
    stability: {
      question: '人口与资源能否在长期压力下继续被组织起来？',
      intro: '稳定领域观察控制自身、组织人口资源和保持基本秩序的条件。城市化、内部冲突、长期通胀和人口结构提供不同线索，地理及外部安全环境补充承压背景。它帮助读者从资源与人口的总量，进一步理解持续协调的条件。',
      connections: '稳定联系劳动力、税基和动员基础，也关系生产与供给能否持续协调；需要与经济和人口条件共同阅读。',
      facets: [
        {
          title: '组织覆盖与协调压力',
          text: '城市化提供教育、信息传播与资源组织覆盖的线索，内部冲突和长期通胀补充控制与协调压力。政变暴乱字段的方向和缩放规则未注明，不能自行判定数值高低的优劣。',
          fields: ['stability-D', 'stability-F', 'stability-H']
        },
        {
          title: '人口结构与持续补充',
          text: '当前人口、劳动人口与未来人口分别涉及现有规模、可用劳动条件和变化方向。劳动力、劳动年龄人口和实际就业不同，各列的年份与预测口径也应分别核对。',
          fields: ['stability-O', 'stability-L', 'stability-N', 'stability-I', 'stability-K']
        },
        {
          title: '环境与组织条件',
          text: '报告以“天时”观察外部安全环境，“地利”观察地理约束，“人和”观察人口质量对复杂组织的支持。这些是原表保留的判断线索，具体调整过程没有全部转成计算规则。',
          fields: ['stability-P', 'stability-Q', 'stability-R']
        }
      ]
    }
  }
};
