export const characters = [
  {
    "id": "cat",
    "name": "고양이",
    "emoji": "🐱",
    "category": "동물"
  },
  {
    "id": "dog",
    "name": "강아지",
    "emoji": "🐶",
    "category": "동물"
  },
  {
    "id": "rabbit",
    "name": "토끼",
    "emoji": "🐰",
    "category": "동물"
  },
  {
    "id": "bear",
    "name": "곰",
    "emoji": "🐻",
    "category": "동물"
  },
  {
    "id": "panda",
    "name": "판다",
    "emoji": "🐼",
    "category": "동물"
  },
  {
    "id": "fox",
    "name": "여우",
    "emoji": "🦊",
    "category": "동물"
  },
  {
    "id": "tiger",
    "name": "호랑이",
    "emoji": "🐯",
    "category": "동물"
  },
  {
    "id": "lion",
    "name": "사자",
    "emoji": "🦁",
    "category": "동물"
  },
  {
    "id": "koala",
    "name": "코알라",
    "emoji": "🐨",
    "category": "동물"
  },
  {
    "id": "penguin",
    "name": "펭귄",
    "emoji": "🐧",
    "category": "동물"
  },
  {
    "id": "frog",
    "name": "개구리",
    "emoji": "🐸",
    "category": "동물"
  },
  {
    "id": "hamster",
    "name": "햄스터",
    "emoji": "🐹",
    "category": "동물"
  },
  {
    "id": "apple",
    "name": "사과",
    "emoji": "🍎",
    "category": "과일"
  },
  {
    "id": "pear",
    "name": "배",
    "emoji": "🍐",
    "category": "과일"
  },
  {
    "id": "orange",
    "name": "귤",
    "emoji": "🍊",
    "category": "과일"
  },
  {
    "id": "lemon",
    "name": "레몬",
    "emoji": "🍋",
    "category": "과일"
  },
  {
    "id": "banana",
    "name": "바나나",
    "emoji": "🍌",
    "category": "과일"
  },
  {
    "id": "watermelon",
    "name": "수박",
    "emoji": "🍉",
    "category": "과일"
  },
  {
    "id": "grapes",
    "name": "포도",
    "emoji": "🍇",
    "category": "과일"
  },
  {
    "id": "strawberry",
    "name": "딸기",
    "emoji": "🍓",
    "category": "과일"
  },
  {
    "id": "cherry",
    "name": "체리",
    "emoji": "🍒",
    "category": "과일"
  },
  {
    "id": "peach",
    "name": "복숭아",
    "emoji": "🍑",
    "category": "과일"
  },
  {
    "id": "pineapple",
    "name": "파인애플",
    "emoji": "🍍",
    "category": "과일"
  },
  {
    "id": "kiwi",
    "name": "키위",
    "emoji": "🥝",
    "category": "과일"
  },
  {
    "id": "monkey",
    "name": "원숭이",
    "category": "동물"
  },
  {
    "id": "dolphin",
    "name": "돌고래",
    "category": "동물"
  },
  {
    "id": "wolf",
    "name": "늑대",
    "category": "동물"
  },
  {
    "id": "seal",
    "name": "물개",
    "category": "동물"
  },
  {
    "id": "shark",
    "name": "상어",
    "category": "동물"
  },
  {
    "id": "squirrel",
    "name": "다람쥐",
    "category": "동물"
  },
  {
    "id": "mango",
    "name": "망고",
    "category": "과일"
  },
  {
    "id": "melon",
    "name": "메론",
    "category": "과일"
  },
  {
    "id": "orientalmelon",
    "name": "참외",
    "category": "과일"
  },
  {
    "id": "plum",
    "name": "자두",
    "category": "과일"
  },
  {
    "id": "blueberry",
    "name": "블루베리",
    "category": "과일"
  },
  {
    "id": "avocado",
    "name": "아보카도",
    "category": "과일"
  }
];
characters.forEach(c => { c.image = `/characters/${c.id}.svg`; });
export const characterFor = id => characters.find(c => c.id === id) || characters[0];
