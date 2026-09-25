/* Reading copy checked against 综合国力2.0.pdf (17 actual pages).
 * PDF SHA-256: 0a9beee6258b9a9e210f4d979fafbd26ace8cc29d8d763bc2556a866e244cf40
 * Sources by current workbook domain:
 * politics: pp.12-13 (PDF "发展"); economy: pp.9-11; military: pp.3-6;
 * agriculture: pp.8-9; energy: pp.13-15; minerals: pp.6-8;
 * transport: pp.15-16; stability: pp.11-12 (PDF "政治").
 * Research scope and score reading: pp.1,3. Cross-domain links use these same sections.
 * Groups are editorial reading paths, not a new research model or score.
 * Field mappings stay unchanged; country values and conclusions do not live here.
 */
const READING_GUIDE = {
  groups: [
    {
      id: 'rank',
      title: '三项排名',
      intro: '政治、经济、军事按名次排列，数字越小越靠前。',
      domains: ['politics', 'economy', 'military']
    },
    {
      id: 'score',
      title: '五项评分',
      intro: '交通、农业、能源、矿产、稳定采用 1–5 级评分。',
      domains: ['transport', 'agriculture', 'energy', 'minerals', 'stability']
    }
  ],
  domains: {
    politics: {
      question: '人口质量、技术和对外影响力如何？',
      intro: '这一领域观察人口质量、科研、工业竞争力，以及外交、企业和金融网络。它补充经济总量与军事规模未直接反映的长期能力。',
      connections: '报告将教育和医疗视为科研、工业与国家组织的基础；科研投入则观察经济资源向知识和技术能力的转化。',
      facets: [
        {
          title: '人口条件与知识投入',
          text: '人类发展指数用于观察人口质量，报告着重讨论教育和医疗；报告以科研投入占GDP的比例观察持续投入知识与技术的强度。',
          fields: ['politics-F', 'politics-H']
        },
        {
          title: '工业与企业的组织能力',
          text: '工业竞争力兼看制造业规模、技术结构和出口，避免仅凭高科技产业占比判断。跨国公司数量观察企业组织跨境资本、生产与市场的能力。',
          fields: ['politics-L', 'politics-M']
        },
        {
          title: '外交网络与金融联系',
          text: '大使馆数量反映持续处理国际事务的范围；IMF投票份额反映国际金融制度中的正式权重；主权基金与外汇储备反映海外资产配置和危机支付条件。',
          fields: ['politics-J', 'politics-I', 'politics-N']
        }
      ]
    },
    economy: {
      question: '每年生产多少，已经积累多少？',
      intro: '经济领域以GDP和购买力平价GDP为主，结合财富、资本、用电、人口就业和增长观察经济规模。年度产出说明当前生产，资产与资本说明过去积累，增长说明较长期的变化方向。',
      connections: '购买力平价GDP也用于军事动员判断；机器、厂房和基础设施反映已经形成的生产条件。',
      facets: [
        {
          title: '年度产出与实际运行',
          text: '名义GDP观察经济规模及进口、海外支付能力；购买力平价GDP按本地价格观察国内生产规模。用电量补充居民、工业和数字基础设施的运行情况。',
          fields: ['economy-G', 'economy-E', 'economy-O']
        },
        {
          title: '资产、财富与生产资本',
          text: '国内资产记录境内资产基础；按报告采用的广义财富框架，国民财富涉及自然、人力、生产资本及对外资产；资本存量侧重机器、厂房和基础设施。这些存量与一年的产出分别阅读。',
          fields: ['economy-I', 'economy-K', 'economy-M']
        },
        {
          title: '就业、人口与增长',
          text: '就业人口观察当前参与生产的人数，总人口涉及市场规模和动员上限。较长期增长用于观察经济扩张速度，各增长字段按原表各自的算法保留。',
          fields: ['economy-T', 'economy-V', 'economy-Q', 'economy-R']
        }
      ]
    },
    military: {
      question: '能否发起、承受并长期维持全面战争？',
      intro: '军事领域衡量国家在自身地理和战略目标下，发起、承受并长期维持全面战争的能力。海军、空军、陆军和国防动员分别考察作战与补充条件，最终判断还考虑装备质量、补给线、敌手和联盟。',
      connections: '人口、购买力平价GDP和国土分别对应兵员、国内生产能力与战略纵深；联盟背景涉及情报、基地、补给和共同防御。',
      facets: [
        {
          title: '舰队规模与海上任务',
          text: '海军吨位观察平台规模，航母、两栖舰与舰载机观察海军航空力量，垂直发射单元观察一次装填的防空和打击容量。攻击潜艇补充水下作战能力。',
          fields: ['military-C', 'military-K', 'military-J', 'military-L', 'military-M']
        },
        {
          title: '防空、侦察与空中投送',
          text: '防空反导观察研发、生产、部署和实战能力；卫星提供侦察、通信条件。报告中的军机包括战斗机、轰炸机和直升机，运输机另用于观察远距离投送与持续保障。',
          fields: ['military-D', 'military-N', 'military-O', 'military-P']
        },
        {
          title: '地面力量与长期动员',
          text: '现役兵力、坦克和火炮分别观察常备人员、地面突击与持续火力。军费和单兵开支反映投入与保障；国防动员还涉及人口、生产、战略纵深和核威慑。',
          fields: ['military-E', 'military-I', 'military-Q', 'military-R', 'military-F', 'military-H', 'military-V']
        }
      ]
    },
    agriculture: {
      question: '能否持续提供食物、水、纤维和木材？',
      intro: '农业领域观察本国土地与生产能否满足人口的粮食、水、纺织原料和木材需求。既看当前总量与人均供给，也看土地、技术和水资源允许的扩产空间，重点关注危机中的供给短板。',
      connections: '土地和水限制农业扩产；磷肥、钾肥所需原料另在矿产领域观察。',
      facets: [
        {
          title: '总供给与人均基础',
          text: '谷物总产量、人均谷物和每日热量分别观察供应规模、人均条件与热量条件。肉类按可替代的谷物热量折算。',
          fields: ['agriculture-E', 'agriculture-F', 'agriculture-N', 'agriculture-H']
        },
        {
          title: '土地、产量与扩产空间',
          text: '耕地面积和单位面积产量决定生产基础。报告用最大人均产量观察土地与技术条件下的供给潜力，作物、轮作和加工差异会影响判断。',
          fields: ['agriculture-C', 'agriculture-G', 'agriculture-D']
        },
        {
          title: '水、纤维与木材',
          text: '境内水、外部来水和取水量观察水量及依赖条件；淡化补充城市和工业用水，大规模灌溉仍受成本限制。纤维作物和林地另观察衣物原料与木材供给。',
          fields: ['agriculture-Q', 'agriculture-R', 'agriculture-U', 'agriculture-W', 'agriculture-V', 'agriculture-K', 'agriculture-M']
        }
      ]
    },
    energy: {
      question: '能源供给能否维持经济、军队和社会运行？',
      intro: '能源领域分别观察石油、天然气和煤炭的产量、储量、消费、自给率及储采年限。核电与风能、水力、太阳能补充发电供给，用于判断长期冲击下的能源保障。',
      connections: '核电和可再生能源首先替代发电用化石燃料；运输、化工和高温工业仍大量使用油气煤，因此报告将这些发电来源作为补充。',
      facets: [
        {
          title: '产量、消费与自给率',
          text: '产量说明当前供给，消费说明本地需求，自给率观察需求能由本国生产覆盖多少。报告区分不使用某种能源与使用却缺少供给的情况。',
          fields: ['energy-W', 'energy-Y', 'energy-Q', 'energy-S', 'energy-T', 'energy-V', 'energy-G', 'energy-M']
        },
        {
          title: '储量与当前开采速度',
          text: '储量说明较长期的资源基础，储采年限把储量与当前产量相比较，估计按这一开采速度可维持多久。它取决于当前生产条件。',
          fields: ['energy-X', 'energy-R', 'energy-U', 'energy-H', 'energy-N']
        },
        {
          title: '核电与可再生发电',
          text: '核电和可再生发电占比观察已有替代电力能够覆盖多少发电需求。它们反映发电环节，不能直接作为全部能源需求的替代比例。',
          fields: ['energy-F', 'energy-E', 'energy-D']
        }
      ]
    },
    minerals: {
      question: '工业原料是否齐备，供给是否充足？',
      intro: '矿产领域观察本国能否为工业提供基本原料。评分结合矿产品类、本地需求、进口依赖和出口余量，关注不同用途原料的供给情况。',
      connections: '金属用于建筑、机器、电网和装备；铀用于核燃料，磷和钾用于化肥。不同原料分别支撑工业、能源和农业。',
      facets: [
        {
          title: '基础建设与工业材料',
          text: '铁用于炼钢，铜用于电力和电子设备，铝满足轻量化需求。',
          fields: ['minerals-C', 'minerals-D', 'minerals-E', 'minerals-Z']
        },
        {
          title: '合金、航空与电池材料',
          text: '铬用于不锈钢和耐腐蚀合金，镍用于不锈钢与电池，钛用于航空航天，锂用于电池与储能。它们对应不同的材料性能和工业用途。',
          fields: ['minerals-F', 'minerals-H', 'minerals-I', 'minerals-K']
        },
        {
          title: '核燃料与化肥原料',
          text: '铀关系核燃料供应；磷和钾分别提供磷肥、钾肥原料。工业原料之外，这些矿种还关系供电与农业生产。',
          fields: ['minerals-P', 'minerals-Q', 'minerals-R']
        }
      ]
    },
    transport: {
      question: '人员、物资和信息能否顺畅流动？',
      intro: '交通领域观察公路、铁路、机场、车辆、内河航道和网络覆盖，并用物流效率补充设施数量。长度和密度反映连接条件，载具和运输组织反映网络如何使用。',
      connections: '公路承担末端运输，铁路和内河航运承担大宗货物运输，航空缩短远距离往来时间。报告同时关注铁路等设施在战争运输中的作用。',
      facets: [
        {
          title: '道路、铁路与机场覆盖',
          text: '道路连接居民和生产地点，铁路承担长距离重载，机场提供快速连接。报告计算密度时使用人工估算的有效国土面积，扣除大面积不宜居区域。',
          fields: ['transport-F', 'transport-G', 'transport-I', 'transport-J', 'transport-L', 'transport-M', 'transport-V']
        },
        {
          title: '车辆与内河运输',
          text: '汽车数量及人均汽车观察道路运输的载具基础。内河航道及通航比观察低成本水运条件，大宗货物运输尤其依赖这些条件。',
          fields: ['transport-O', 'transport-P', 'transport-R', 'transport-T']
        },
        {
          title: '信息网络与物流效率',
          text: '网络分数观察信息连接能力；物流绩效观察海关、运输组织、追踪和时效。它们补充里程与密度无法反映的运行效率。',
          fields: ['transport-D', 'transport-E', 'transport-C']
        }
      ]
    },
    stability: {
      question: '能否组织人口资源并维持基本秩序？',
      intro: '稳定领域观察国家在长期压力下控制自身、组织人口资源和维持基本秩序的能力。城市化、政治暴力风险、长期通胀、人口结构，以及外部安全和地理条件，分别反映不同压力。',
      connections: '人口变化影响劳动力、税基和动员；教育与医疗条件影响复杂组织和长期动员。稳定领域因此同时涉及现有人口和持续组织能力。',
      facets: [
        {
          title: '城市化、冲突与通胀',
          text: '城市化涉及教育、信息传播和资源调配的覆盖成本；政治暴力风险涉及政变、暴乱和恐怖主义。长期通胀用于观察财政金融协调是否持续承压。',
          fields: ['stability-D', 'stability-F', 'stability-H']
        },
        {
          title: '劳动力与人口变化',
          text: '当前人口和劳动力观察现有规模及劳动供给，劳动人口占比涉及抚养负担。未来人口及其变化用于观察人口收缩对劳动力、税基和动员的压力。',
          fields: ['stability-O', 'stability-L', 'stability-N', 'stability-I', 'stability-K']
        },
        {
          title: '天时、地利、人和',
          text: '“天时”指威胁国家或政权生存的外部关系；“地利”指缺水、国土过小等地理限制；“人和”主要指教育、医疗等人口质量。',
          fields: ['stability-P', 'stability-Q', 'stability-R']
        }
      ]
    }
  }
};
