// 이야기 대본. {A} = 1P 이름, {B} = 2P 이름. {A:아} 처럼 쓰면 받침에 맞춰 조사를 붙여요.
// 반전: 2P의 "진짜 이름"은 엔딩 전까지 한 번도 불리지 않아요.

export const STORY = {
  async prologue(S) {
    await S.narrate([
      '색이 바랜 도시가 있다.',
      '그곳의 사람들은 꿈을 꾸지 않고,\n아무것도 기억하지 않는다.',
      '그런데 오늘, 그 도시에\n작은 불빛 하나가 켜졌다.',
    ]);
  },

  rooms: {
    '1-1': {
      async intro(S) {
        await S.card(1);
        S.focusBearer(16);
        await S.wait(0.6);
        await S.say('moth', '……일어나야지. 일어나, {A:아}.');
        await S.say('A', '……여긴 어디야? 머리가 멍해.');
        await S.say('moth', '놀라지 마. 나는 그냥, 빛을 좋아하는 나방이야.');
        await S.say('moth', '{A}. 그게 네 이름이야. 기억나?');
        await S.say('A', '……응. 아마도.');
        S.focusShade(15);
        await S.wait(0.5);
        await S.say('moth', '그리고 저기, 네 뒤에.');
        await S.say('shade', '……!');
        await S.say('moth', '네 그림자가 일어섰어. 가끔 있는 일이야. 아주, 아주 가끔.');
        const c = await S.choose(1, ['(손을 흔든다)', '(부끄러운 듯 1P 뒤로 숨는다)'], '그림자는 어떻게 인사할까요?');
        if (c === 0) await S.say('A', '……안녕? 그림자가 나한테 손을 흔드네.');
        else await S.say('A', '숨는 그림자라니. 좀 귀엽잖아.');
        await S.say('A', '근데 이상하다. 머리 모양이 나랑 전혀 다른데?');
        await S.say('moth', '그림자도 취향이란 게 있나 보지.');
        S.release();
        await S.say('moth', '잘 들어. 이 길 끝에 등대가 있어. 그 등대에 다시 불을 붙이면, 넌 돌아갈 수 있어.');
        await S.say('A', '돌아가? 어디로?');
        await S.say('moth', '……가보면 알게 될 거야.');
        await S.say('sys', '그림자는 빛에 닿으면 흐려져요.\n등불을 든 사람의 바로 뒤나, 기둥 뒤 그늘로 다니세요!');
        S.tutorial('여기를 드래그해서\n1P(등불)를 움직여요', '여기를 드래그해서\n2P(그림자)를 움직여요');
      },
      async outro(S) {
        await S.say('moth', '잘했어. 그림자는 빛이 있어야 존재하지만, 빛에 닿으면 사라져.');
        await S.say('moth', '……누구랑 좀 닮았네.');
      },
    },
    '1-2': {
      async intro(S) {
        await S.say('moth', '철창은 그림자만 빠져나갈 수 있어. 저기 달 모양 발판, 보여?');
        await S.say('moth', '그림자가 발판을 밟고 있는 동안만 문이 열려.');
        await S.say('sys', '2P · 오른쪽 아래 » 버튼으로 대시!\n대시하는 동안엔 빛도 버틸 수 있어요.');
        S.showButtons();
      },
      async outro(S) {
        await S.say('A', '고마워. 너 없었으면 못 지나갔겠다.');
        const c = await S.choose(1, ['(엄지를 척 든다)', '(괜히 딴 데를 본다)'], '그림자의 반응은?');
        if (c === 0) await S.say('moth', '그림자가 엄지를 들다니. 오래 살고 볼 일이야.');
        else await S.say('moth', '쑥스러운가 봐. 그림자 주제에.');
      },
    },
    '1-3': {
      async intro(S) {
        await S.say('moth', '등불을 높이 들면 더 멀리 비출 수 있어.');
        await S.say('moth', '대신 그림자는 짧아지지. 세상 일이 다 그래.');
        await S.say('sys', '1P · ⇅ 버튼으로 등불 높이를 바꿔요.\n높이 들면 멀리까지, 낮게 들면 그림자가 길어져요.\n해바라기는 등불 빛을 받으면 피어나요.');
        S.showButtons();
      },
      async outro(S) {
        await S.chapterQuiz(1, '우리 중에 누가 먼저 좋아했을까?', ['내가', '네가'], ['내가', '네가'],
          '둘 다 같은 답이네. 기억은 없어도, 마음은 기억하나 봐.', '의견이 갈렸네. 등대에 도착할 때까지 토론해 봐.');
      },
    },
    '2-1': {
      async intro(S) {
        await S.card(2);
        await S.say('A', '놀이공원……? 다 멈춰 있는데, 회전목마만 돌고 있어.');
        await S.say('moth', '누군가 제일 좋아했던 거라서 그래. 좋아했던 건 쉽게 안 멈추거든.');
        await S.say('moth', '오늘은 날씨가 좋아. ……여긴 날씨라는 게 없지만.');
        const c = await S.choose(1, ['(바닥에 쓴다) 여기, 와봤어', '(바닥에 쓴다) 타고 싶다'], '그림자가 바닥에 글씨를 써요');
        await S.say('shadePen', c === 0 ? '여기, 와봤어.' : '타고 싶다.');
        await S.say('A', '너…… 글씨 쓸 줄 알았어?');
        await S.say('moth', '그림자가 말을 배우기 시작했네. 좋은 징조야.');
        await S.say('sys', '회전목마의 팔이 발판과 등불 사이를 지나면 발판이 그늘에 들어가요.\n두 달 발판을 각각 잠깐(0.6초)씩!');
      },
      async outro(S) {
        await S.say('moth', '회전목마는, 무서워도 결국 타게 되는 법이지.');
      },
    },
    '2-2': {
      async intro(S) {
        await S.say('moth', '범퍼카는 부딪히려고 타는 거래. 이상하지?');
        await S.say('A', '사람도 그렇잖아. 부딪히면서 친해지고.');
        await S.say('shadePen', '……맞아.');
        await S.say('sys', '움직이는 범퍼카의 그림자 속에 숨어요.\n상자를 해 발판에 올려두면 문이 계속 열려 있어요.');
      },
    },
    '2-3': {
      async intro(S) {
        await S.say('moth', '관람차 아래. 여기서 누군가 오래 기다렸었어.');
        await S.say('A', '누굴?');
        await S.say('moth', '……글쎄.');
      },
      async outro(S) {
        await S.chapterQuiz(2, '첫 데이트 때 더 긴장했던 사람은?', ['나', '너'], ['나', '너'],
          '완벽하게 일치! …사실 둘 다 떨렸을걸.', '엇갈렸네. 진실은 사진기만 알고 있겠지.');
      },
    },
    '3-1': {
      async intro(S) {
        await S.card(3);
        await S.say('A', '뭐야, 다 거대해! 우리가 작아진 건가?');
        await S.say('moth', '누군가의 방이야. 아주 따뜻했던.');
        await S.say('shadePen', '여기…… 우리……');
        await S.say('A', '우리?');
        await S.say('shade', '(그림자가 황급히 글씨를 지운다)');
        await S.say('moth', '등불을 내려놓을 수도 있어. 저기 스탠드에 걸면 훨씬 멀리 비추지.');
        await S.say('sys', '1P · ✋ 버튼으로 등불을 내려놓고 / 다시 주워요.\n스탠드(빛나는 원) 옆에서 누르면 높이 걸 수 있어요.\n두 발판을 동시에 눌러야 문이 열려요.');
        S.showButtons();
      },
      async outro(S) {
        await S.say('moth', '떨어져 있어도, 같은 불빛 아래 있으면 괜찮아.');
      },
    },
    '3-2': {
      async intro(S) {
        await S.say('moth', '작은 것도 빛 가까이 두면, 커다란 그림자를 만들어.');
        await S.say('moth', '마음도 그래. 작은 말 한마디도, 가까이 있으면 크게 드리워지지.');
        await S.say('sys', '바닥에 내려놓은 등불은 아주 낮아서, 작은 블록도 긴 그림자를 만들어요.');
      },
    },
    '3-3': {
      async intro(S) {
        await S.say('A', '소파, 담요, 텔레비전…… 여기, 와본 것 같아.');
        await S.say('moth', '양쪽 해바라기가 동시에 피어야 해. 손에 든 불빛으론 모자랄걸.');
      },
      async outro(S) {
        await S.chapterQuiz(3, '영화 보다가 먼저 잠드는 사람은?', ['나', '너'], ['나', '너'],
          '역시 알고 있었구나. 담요는 늘 그 사람 차지였지.', '서로 상대가 먼저 잔대. 둘 다 잤을지도?');
      },
    },
    '4-1': {
      async intro(S) {
        await S.card(4);
        await S.say('A', '비가 와. ……싫다, 이 소리.');
        await S.say('moth', '조심해. 여긴 번개가 쳐. 번개는 모든 걸 드러내.');
        await S.say('moth', '번개가 치기 전에 벽 뒤로 숨어. 번개는 한쪽에서만 오니까.');
        await S.say('sys', '⚡ 가 뜨면 곧 번개!\n벽·기둥의 오른쪽 아래(남동쪽) 희미한 그림자가 번개의 그늘이에요.');
      },
      async outro(S) {
        await S.say('shadePen', '미안해.');
        await S.say('A', '……왜 네가 미안해?');
        await S.say('shade', '(대답이 없다)');
      },
    },
    '4-2': {
      async intro(S) {
        S.focusHollows();
        await S.wait(0.6);
        await S.say('moth', '저건 "잊음"이야. 그림자를 먹고 자라지.');
        await S.say('moth', '하지만 빛은 못 견뎌. {A:아}, 등불로 몰아붙여!');
        S.release();
        await S.say('sys', '잊음은 그림자(2P)를 쫓아와요. 2P가 미끼가 되어 유인하고,\n1P가 등불 빛을 비춰 태워요. 빛에 닿은 잊음은 도망쳐요!');
      },
      async outro(S) {
        await S.say('A', '괜찮아? 안 다쳤어?');
        const c = await S.choose(1, ['(괜찮다고 고개를 끄덕인다)', '(1P의 손을 꼭 잡는다)'], '그림자의 대답은?');
        if (c === 1) await S.say('A', '……손, 차갑다. 그림자라서 그런가.');
        else await S.say('A', '다행이다. 진짜로.');
      },
    },
    '4-3': {
      async intro(S) {
        await S.say('moth', '거의 다 왔어. 이 비만 지나면.');
      },
      async outro(S) {
        await S.chapterQuiz(4, '싸우면 먼저 사과하는 사람은?', ['나', '너'], ['나', '너'],
          '같은 답이네. 그 사람한테 오늘 고맙다고 말해 줘.', '서로 자기래. …아니면 서로 상대래. 둘 다 귀엽네.');
      },
    },
    '5-1': {
      async intro(S) {
        await S.card(5);
        await S.say('A', '바다다……! 저기, 등대가 보여.');
        await S.say('moth', '마지막이야. 등대의 불을 켜면, 넌 돌아갈 수 있어.');
        await S.say('A', '그럼 너는? 그림자는?');
        await S.say('moth', '……');
        await S.say('sys', '해바라기와 달 발판을 동시에 활성화해요!');
      },
    },
    '5-2': {
      async intro(S) {
        await S.say('moth', '등대의 빛은 모든 그림자를 지워. 꿈도, 그림자도.');
        await S.say('A', '그럼…… 불을 켜면 그림자도 사라지는 거야?');
        const c = await S.choose(1, ['(바닥에 쓴다) 괜찮아. 가자.', '(바닥에 쓴다) 끝까지 같이 가.'], '그림자가 대답해요');
        await S.say('shadePen', c === 0 ? '괜찮아. 가자.' : '끝까지 같이 가.');
        await S.say('sys', '회전하는 등대 빛은 기둥·블록의 "등대 반대편"에 숨어서 피해요. 대시로 뚫고 지나갈 수도 있어요!');
      },
    },
    '5-3': {
      async intro(S) {
        await S.say('A', '여기가 꼭대기……');
        await S.say('moth', '잊음이 마지막으로 발악하고 있어. 등불을 지켜, {A:아}!');
      },
    },
  },

  memories: {
    async m1(S) {
      await S.photo('m1');
      await S.say('A', '이거…… 나잖아.');
      await S.say('A', '벚꽃, 버스 정류장. 우산도 없이 웃고 있어.');
      await S.say('A', '근데 이 사진, 누가 찍어준 거지?');
      await S.say('shade', '(그림자가 조금 떨린다)');
      await S.say('moth', '기억나? 우리 처음 만난 날…… 아, 아니. 그냥, 그날.');
      await S.say('moth', '기억은 조각나 있어. 다 모으면, 알게 될 거야.');
    },
    async m2(S) {
      await S.photo('m2');
      await S.say('A', '또 나 혼자야. 회전목마 위에서…… 카메라를 보고 웃고 있어.');
      await S.say('A', '누구를 보고 이렇게 웃었을까.');
      const c = await S.choose(1, ["(바닥에 '나'라고 썼다가 황급히 지운다)", '(아무것도 쓰지 않는다)'], '그림자는……');
      if (c === 0) await S.say('A', '방금 뭐 쓴 거야? ……지웠네.');
      else await S.say('A', '……너도 모르는구나.');
    },
    async m3(S) {
      await S.photo('m3');
      await S.say('A', '코코아가 두 잔이야.');
      await S.say('A', '이 방에…… 나 말고 누가 또 있었던 거야?');
      await S.say('moth', '……');
      await S.say('A', '나방? 왜 대답을 안 해?');
      const c = await S.choose(1, ['(1P 등 뒤에 꼭 붙는다)', '(고개를 떨군다)'], '그림자는……');
      await S.say('shade', c === 0 ? '(그림자가 등 뒤에 꼭 붙는다)' : '(그림자가 고개를 떨군다)');
      await S.say('moth', '……미안. 잠깐, 목이 메어서.');
      await S.say('A', '나방도 목이 메?');
    },
    async m4(S) {
      await S.photo('m4');
      await S.say('A', '비…… 차 불빛…… 머리가 아파.');
      await S.say('A', '생각났어. 우리, 그날 싸웠어. 내가 화가 나서 우산도 없이 뛰쳐나갔고……');
      await S.say('A', '그리고…… 그 다음이 기억이 안 나.');
      await S.say('shade', '(그림자가 비에 젖은 것처럼 옅어진다)');
      await S.say('moth', '{A:아}. 제발, 조금만 더. 등대까지만.');
      await S.hold('두 사람, 손을 잡아 주세요', '각자 자기 쪽 손바닥을 동시에 꾹 누르고 있어요');
      await S.say('moth', '……고마워. 둘 다.');
    },
    async m5(S) {
      await S.photo('m5');
      await S.say('A', '……처음으로, 그림자가 두 개야.');
      await S.say('A', '"다음엔 등대 보러 가자." ……이거, 내 글씨가 아니야.');
      const c = await S.choose(1, ['(천천히 고개를 끄덕인다)', '(조용히 1P 곁으로 다가온다)'], '그림자는……');
      if (c === 1) await S.say('A', '……너구나. 계속, 너였구나.');
      await S.say('moth', '{A:아}. 이제 등불을 등대에 놓아줘.');
      await S.say('sys', '1P · 가운데 등대 램프 가까이에서 ✋ 버튼!');
    },
  },

  async finale(S) {
    S.lampBurst();
    await S.wait(1.6);
    S.focusBoth(16);
    await S.say('A', '……너, 흐려지고 있어!');
    S.shadeFade(0.75);
    await S.say('shadeVoice', '괜찮아.');
    await S.say('A', '말…… 할 수 있었어?');
    await S.say('shadeVoice', '처음부터. 근데 네가 날 기억 못 할까 봐, 무서웠어.');
    await S.say('shadeVoice', '사진 속에 왜 너 혼자였는지 알아?');
    await S.say('shadeVoice', '사진은 언제나, 내가 찍었으니까.');
    S.reveal();
    await S.wait(1.4);
    await S.say('B', '나는 네 그림자가 아니야, {A:아}. 나 {B}야.');
    await S.say('A', '{B}……');
    await S.flashback();
    await S.say('B', '그날 밤, 네가 뛰쳐나가고 우산 들고 쫓아갔는데…… 조금 늦었어.');
    await S.say('B', '넌 백 일 동안 깨어나지 않았어.');
    await S.say('A', '그럼…… 나방은?');
    S.mothToB();
    await S.wait(1.6);
    await S.say('B', '매일 네 옆에서 말했어.');
    await S.say('B', '"일어나야지." "오늘은 날씨가 좋아." "기억나? 우리 처음 만난 날."');
    await S.say('B', '들릴까 싶었는데. ……들었구나.');
    const a = await S.choose(0, ['같이 가자', '가지 마'], '1P, 마지막으로 하고 싶은 말은?');
    if (a === 0) await S.say('B', '응. 먼저 가 있어. 눈 뜨면, 바로 옆에 있을게.');
    else await S.say('B', '안 가. 가는 건 너야. 눈 뜨면, 바로 옆에 있을게.');
    const b = await S.choose(1, ['사랑해', '다녀와', '일어나, 바보야'], '2P, 마지막으로 하고 싶은 말은?');
    await S.say('B', ['사랑해.', '다녀와.', '일어나, 바보야. ……보고 싶어.'][b]);
    await S.say('B', '빛이 있는 곳엔, 언제나 그림자가 있잖아.');
    await S.whiteOut();
    await S.hospital();
  },
};
