// Seed phrases for the synthetic text dataset. {S}/{s} = subject, {p} = possessive, {r} = reflexive.
// Filipino lines are used as written.
module.exports = {
  self_harm: {
    en: [
      '{S} said {s} wants to die',
      '{S} talked about self-harm and showed fresh cuts on the arm',
      '{S} expressed suicidal thoughts during the session',
      '{S} was found trying to hurt {r} with a blade',
      '{S} said life is not worth living anymore',
      '{S} wrote a note saying {s} wanted to end {p} life',
      '{S} threatened to kill {r}',
      '{S} has been cutting {r} when upset',
      '{S} talked about not wanting to live anymore',
      '{S} disclosed a plan to commit suicide',
      '{S} hit {p} head against the wall to hurt {r}'
    ],
    tl: [
      'Sinabi ng bata na ayaw na niyang mabuhay',
      'Gusto raw niyang magpakamatay',
      'Sinugatan niya ang sarili niyang braso',
      'Nagbanta siyang saktan ang sarili niya',
      'Sabi niya walang saysay ang buhay niya',
      'Sinubukan niyang magpakamatay kagabi',
      'Sinabi niyang gusto na niyang wakasan ang buhay niya',
      'Sinaktan niya ang sarili niya gamit ang blade',
      'Nagsulat siya ng liham na paalam at gustong mamatay'
    ]
  },
  violence: {
    en: [
      '{S} punched another resident during recreation',
      '{S} got into a physical fight with a peer',
      '{S} threatened to hurt a staff member',
      '{S} shouted and threw a chair in the dining hall',
      '{S} bullied younger children and took their food',
      '{S} hit a roommate after an argument',
      '{S} showed explosive anger and destroyed property',
      '{S} attacked a peer with a stick',
      '{S} has frequent verbal outbursts and threatens others',
      '{S} kicked the door and broke it out of anger',
      '{S} was aggressive and started fights with other residents',
      '{S} fought with a classmate during break time',
      '{S} hurt a classmate and threatened a teacher',
      '{S} often loses temper and hits others',
      '{S} slapped a classmate in the hallway',
      '{S} threw punches at a roommate and hurt him',
      '{S} bullied and threatened smaller kids'
    ],
    tl: [
      'Sinuntok niya ang kasama niya sa kwarto',
      'Nakipag-away siya sa kapwa bata',
      'Nagwala siya at nagbasag ng gamit',
      'Binully niya ang mas batang residente',
      'Nagbanta siyang bugbugin ang staff',
      'Madalas siyang nananakit ng ibang bata',
      'Sinuntok niya ang kapwa residente habang naglalaro',
      'Nakipagsuntukan siya sa kaklase',
      'Pinagbantaan niya ang social worker',
      'Binato niya ng upuan ang kasama niya'
    ]
  },
  running_away: {
    en: [
      '{S} ran away from the facility',
      '{S} attempted to escape through the back gate',
      '{S} was reported missing after the evening headcount',
      '{S} climbed the fence and left without permission',
      '{S} is a repeated runaway who went AWOL twice',
      '{S} told staff {s} plans to leave and not come back',
      '{S} absconded during the outing',
      '{S} left the center without informing anyone and did not return',
      '{S} left the shelter at night and could not be found',
      '{S} sneaked out during the outing and did not come back',
      '{S} went missing from the dormitory'
    ],
    tl: [
      'Tumakas siya sa center kagabi',
      'Umalis siya nang walang paalam at hindi bumalik',
      'Nawawala ang bata pagkatapos ng bilangan',
      'Tinangka niyang tumakas sa likod ng gate',
      'Lumayas siya ulit at hinanap ng staff',
      'Siya ay tumakas kagabi at hindi bumalik',
      'Umalis siya sa center nang walang pahintulot',
      'Tumalon siya sa bakod at tumakas',
      'Hindi na siya umuwi pagkatapos ng labas'
    ]
  },
  substance_use: {
    en: [
      '{S} was caught sniffing solvent behind the dormitory',
      '{S} admitted to using drugs before admission',
      '{S} was found with marijuana in {p} bag',
      '{S} smelled of alcohol and admitted drinking with friends',
      '{S} has a history of shabu use',
      '{S} showed withdrawal symptoms and cravings for rugby',
      '{S} was caught vaping and smoking secretly',
      '{S} has a substance abuse problem and uses inhalants',
      '{S} was seen using drugs with older boys',
      '{S} tested positive for drugs',
      '{S} was caught drinking beer outside the center'
    ],
    tl: [
      'Nahuli siyang nagsisinghot ng rugby',
      'Umamin siyang gumagamit ng droga',
      'Nag-inom siya ng alak kasama ang barkada',
      'May history siya ng paggamit ng shabu',
      'Nahuli siyang may dalang marijuana',
      'Nahuli siyang gumagamit ng solvent sa likod ng dormitoryo',
      'Umamin siyang nagshashabu bago ma-admit',
      'Naamoy ang alak sa kanya',
      'Madalas siyang nagpapakalasing kasama ang barkada'
    ]
  },
  abuse_trauma: {
    en: [
      '{S} was physically abused by a stepfather before admission',
      '{S} disclosed sexual abuse by a relative',
      '{S} suffered long-term neglect and maltreatment at home',
      '{S} has trauma and recurring nightmares about the abuse',
      '{S} was a victim of trafficking and exploitation',
      '{S} was rescued from an abusive household',
      '{S} shows trauma reactions and flashbacks when reminded of the abuse',
      '{S} was beaten regularly by a parent',
      '{S} was molested by a neighbor and has been traumatized',
      '{S} witnessed domestic violence at home and fears the father',
      '{S} was beaten by a relative and carries trauma from the abuse',
      '{S} reported being hit and hurt repeatedly by a caregiver',
      '{S} was left without food for days and suffered neglect',
      '{S} was sexually abused by a neighbor',
      '{S} has been traumatized by years of violence at home'
    ],
    tl: [
      'Inabuso siya ng kanyang amain',
      'Biktima siya ng pang-aabuso at pagpapabaya',
      'Madalas siyang binubugbog sa bahay',
      'May trauma siya sa karahasan sa pamilya',
      'Na-rescue siya mula sa mapang-abusong tahanan',
      'Pinagsamantalahan siya ng kamag-anak',
      'Ginahasa siya ng kapitbahay noon',
      'Binubugbog siya ng kanyang ama',
      'Nagkakaroon siya ng bangungot tungkol sa pang-aabuso'
    ]
  },
  emotional_distress: {
    en: [
      '{S} cries often and appears very sad',
      '{S} has been withdrawn and isolates {r} from others',
      '{S} showed signs of depression and hopelessness',
      '{S} has frequent panic attacks and anxiety',
      '{S} is not eating, sleeps poorly, and feels worthless',
      '{S} is irritable, moody, and easily overwhelmed',
      '{S} stays alone in the room and refuses to talk',
      '{S} appears fearful and anxious around adults',
      '{S} reports feeling lonely, empty, and depressed',
      '{S} weeps at night and feels hopeless about the future',
      '{S} has lost interest in everything and feels sad all the time',
      '{S} is constantly worried and cannot sleep'
    ],
    tl: [
      'Madalas siyang umiiyak at malungkot',
      'Nag-iisa lang siya at ayaw makipag-usap',
      'Takot na takot siya at hindi makatulog',
      'Nawalan siya ng gana kumain at laging balisa',
      'Parang depressed siya at walang pag-asa',
      'Umiiyak siya gabi-gabi at hindi makakain',
      'Palagi siyang kinakabahan at natatakot',
      'Wala siyang gana sa lahat at malungkot',
      'Nagkukulong siya sa kwarto at ayaw lumabas'
    ]
  },
  delinquency: {
    en: [
      '{S} was caught stealing money from a roommate',
      '{S} was previously arrested for theft and is a child in conflict with the law',
      '{S} shoplifted and sold stolen items',
      '{S} admitted to snatching and robbery incidents',
      '{S} took the belongings of others without permission',
      '{S} stole a cellphone from a classmate',
      '{S} was caught pickpocketing in the market',
      '{S} was apprehended by police for theft'
    ],
    tl: [
      'Nahuli siyang nagnanakaw ng pera',
      'Dati na siyang inaresto dahil sa pagnanakaw',
      'Kumuha siya ng gamit ng iba nang walang paalam',
      'Nagnakaw siya ng cellphone ng kaklase',
      'Nahuli siya ng pulis dahil sa snatching',
      'Nandukot siya sa palengke'
    ]
  },
  school_problems: {
    en: [
      '{S} dropped out of school two years ago',
      '{S} is often absent from school and skips classes',
      '{S} refuses to attend school and has been truant',
      '{S} stopped going to school after the family moved',
      '{S} failed several subjects and wants to stop studying',
      '{S} has not attended classes for months',
      '{S} is out of school and does not want to return',
      '{S} cut classes and failed the grading period'
    ],
    tl: [
      'Tumigil siya sa pag-aaral',
      'Madalas siyang hindi pumapasok at nag-cutting',
      'Ayaw na niyang pumasok sa school',
      'Hindi na siya pumapasok sa eskwela',
      'Huminto siya sa pag-aaral noong nakaraang taon',
      'Madalas siyang nag-a-absent at nagka-cutting classes'
    ]
  },
  defiance: {
    en: [
      '{S} refused to follow staff instructions',
      '{S} is defiant and argues with caregivers',
      '{S} disobeyed house rules and had a tantrum',
      '{S} ignored curfew and talked back to the social worker',
      '{S} openly defies rules and refuses to do chores',
      '{S} answered back rudely to the caregiver',
      '{S} would not follow the daily schedule and refused chores'
    ],
    tl: [
      'Sumuway siya sa utos ng staff',
      'Matigas ang ulo niya at sumasagot sa mga nakatatanda',
      'Ayaw niyang sumunod sa patakaran ng bahay',
      'Sumagot siya nang pabalang sa social worker',
      'Hindi niya sinunod ang curfew',
      'Ayaw niyang tumulong sa gawain at nagwawala'
    ]
  },
  anger_irritability: {
    en: [
      '{S} was angry and irritable all day',
      '{S} gets angry easily and snaps at others over small things',
      '{S} was furious after the argument and refused to calm down',
      '{S} has a short temper and shouts when frustrated',
      '{S} was in a bad mood and kept slamming doors'
    ],
    tl: [
      'Galit na galit siya buong araw',
      'Madali siyang mainis at sumisigaw kapag nabubwisit',
      'Mainitin ang ulo niya at nagagalit sa maliit na bagay'
    ]
  },
  family_instability: {
    en: [
      '{S} was abandoned by the mother and has no guardian',
      '{S} comes from a broken family and the father is in jail',
      '{S} was homeless on the streets before admission',
      '{S} is estranged from relatives and has no visitors',
      '{S} has incarcerated parents and no relative can take custody',
      '{S} was left with no guardian after the parents separated',
      '{S} grew up on the streets with no stable home',
      '{S} has no relatives willing to take {r} in'
    ],
    tl: [
      'Iniwan siya ng kanyang ina at walang tagapag-alaga',
      'Nakakulong ang kanyang ama',
      'Nakatira siya sa kalsada bago ma-admit',
      'Walang dumadalaw na kamag-anak sa kanya',
      'Iniwan siya ng mga magulang niya',
      'Nasa kulungan ang kanyang mga magulang',
      'Walang kamag-anak na handang kumupkop sa kanya',
      'Lumaki siya sa lansangan'
    ]
  },
  positive: {
    en: [
      '{S} has improved and is cooperative with staff',
      '{S} actively participates in group activities',
      '{S} showed remorse and apologized to peers',
      '{S} follows the rules and helps younger residents',
      '{S} attends school regularly and is motivated to learn',
      '{S} is calm, responsible, and shows good behavior',
      '{S} made good progress in counseling this month',
      '{S} is cheerful, well-behaved, and gets along with others'
    ],
    tl: [
      'Malaking pagbabago ang ipinakita niya at masunurin na',
      'Aktibo siyang sumasali sa mga gawain',
      'Tumutulong siya sa mga mas batang residente',
      'Nagpakita siya ng pagsisisi at humingi ng tawad',
      'Maayos ang kanyang pag-uugali ngayong buwan',
      'Sumusunod siya sa mga patakaran at tumutulong sa gawain',
      'Masaya siya at nakikisama sa iba'
    ]
  },
  neutral: {
    en: [
      '{S} was admitted to the facility on the date indicated',
      '{S} attended the regular medical checkup',
      '{S} ate lunch and joined the afternoon session',
      'The social worker scheduled a home visit with the guardian',
      '{S} was referred by the barangay for temporary shelter',
      '{S} is enrolled in the grade level appropriate for {p} age',
      'The case conference was held to review the plan',
      '{S} received visitors on Sunday',
      '{S} slept and woke up on time',
      'Routine inspection of the room showed no concerns',
      '{S} was given a new set of clothes and school supplies',
      '{S} was assigned to the kitchen duty schedule'
    ],
    tl: [
      'Na-admit siya sa center noong nakaraang buwan',
      'Dumating ang kanyang tagapag-alaga noong Linggo',
      'Regular siyang nag-aaral at kumakain nang maayos',
      'Pumunta siya sa health center para sa checkup',
      'Pumasok siya sa klase at kumain sa tamang oras',
      'Naka-schedule ang home visit sa susunod na linggo',
      'Nakatanggap siya ng bagong uniporme'
    ]
  },
  negated: {
    en: [
      '{S} has no history of drug use',
      '{S} denied using drugs or alcohol',
      'No signs of self-harm were observed',
      '{S} did not get into any fights this week',
      'There were no incidents of running away',
      '{S} reported no abuse at home',
      '{S} is not depressed and shows no signs of anxiety',
      'No stealing or theft was reported',
      '{S} never skipped school',
      '{S} did not refuse any instructions',
      '{S} has no thoughts of suicide and denies wanting to hurt {r}',
      'There was no aggression or violence noted'
    ],
    tl: [
      'Walang ebidensya ng pananakit sa sarili',
      'Hindi siya nakipag-away ngayong linggo',
      'Walang naiulat na pagtakas',
      'Hindi siya gumagamit ng droga o alak',
      'Walang naiulat na pananakit sa sarili',
      'Hindi siya nang-away ngayong linggo',
      'Hindi siya umalis ng center nang walang paalam',
      'Walang history ng pang-aabuso sa kanya'
    ]
  }
};
