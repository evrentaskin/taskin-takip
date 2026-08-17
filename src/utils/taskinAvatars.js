export const TASKIN_AVATARS = [
  { id: 1, gender: 'girl', glasses: false, src: '/avatars/girl_01.png' },
  { id: 2, gender: 'girl', glasses: false, src: '/avatars/girl_02.png' },
  { id: 3, gender: 'girl', glasses: false, src: '/avatars/girl_03.png' },
  { id: 4, gender: 'girl', glasses: false, src: '/avatars/girl_04.png' },
  { id: 5, gender: 'girl', glasses: false, src: '/avatars/girl_05.png' },
  { id: 6, gender: 'girl', glasses: false, src: '/avatars/girl_06.png' },
  { id: 7, gender: 'girl', glasses: false, src: '/avatars/girl_07.png' },
  { id: 8, gender: 'girl', glasses: false, src: '/avatars/girl_08.png' },
  { id: 9, gender: 'girl', glasses: true, src: '/avatars/girl_glasses_01.png' },
  { id: 10, gender: 'girl', glasses: true, src: '/avatars/girl_glasses_02.png' },
  { id: 11, gender: 'girl', glasses: true, src: '/avatars/girl_glasses_03.png' },
  { id: 12, gender: 'girl', glasses: true, src: '/avatars/girl_glasses_04.png' },
  { id: 13, gender: 'girl', glasses: true, src: '/avatars/girl_glasses_05.png' },
  { id: 14, gender: 'girl', glasses: true, src: '/avatars/girl_glasses_06.png' },
  { id: 15, gender: 'girl', glasses: true, src: '/avatars/girl_glasses_07.png' },
  { id: 16, gender: 'girl', glasses: true, src: '/avatars/girl_glasses_08.png' },
  { id: 17, gender: 'boy', glasses: false, src: '/avatars/boy_01.png' },
  { id: 18, gender: 'boy', glasses: false, src: '/avatars/boy_02.png' },
  { id: 19, gender: 'boy', glasses: false, src: '/avatars/boy_03.png' },
  { id: 20, gender: 'boy', glasses: false, src: '/avatars/boy_04.png' },
  { id: 21, gender: 'boy', glasses: false, src: '/avatars/boy_05.png' },
  { id: 22, gender: 'boy', glasses: false, src: '/avatars/boy_06.png' },
  { id: 23, gender: 'boy', glasses: false, src: '/avatars/boy_07.png' },
  { id: 24, gender: 'boy', glasses: false, src: '/avatars/boy_08.png' },
  { id: 25, gender: 'boy', glasses: true, src: '/avatars/boy_glasses_01.png' },
  { id: 26, gender: 'boy', glasses: true, src: '/avatars/boy_glasses_02.png' },
  { id: 27, gender: 'boy', glasses: true, src: '/avatars/boy_glasses_03.png' },
  { id: 28, gender: 'boy', glasses: true, src: '/avatars/boy_glasses_04.png' },
  { id: 29, gender: 'boy', glasses: true, src: '/avatars/boy_glasses_05.png' },
  { id: 30, gender: 'boy', glasses: true, src: '/avatars/boy_glasses_06.png' },
  { id: 31, gender: 'boy', glasses: true, src: '/avatars/boy_glasses_07.png' },
  { id: 32, gender: 'boy', glasses: true, src: '/avatars/boy_glasses_08.png' }
];

export function getAvatarPool(gender, hasGlasses) {
  const normalizedGender = gender === 'female' || gender === 'kız' || gender === 'Kız'
    ? 'girl'
    : 'boy';

  return TASKIN_AVATARS.filter(
    (avatar) =>
      avatar.gender === normalizedGender &&
      avatar.glasses === Boolean(hasGlasses)
  );
}
