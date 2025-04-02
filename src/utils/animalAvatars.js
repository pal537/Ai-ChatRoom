// 卡通头像库（使用 DiceBear API，提供多种可爱的卡通风格）
const animalAvatars = [
  // 可爱动物风格 (adventurer-neutral)
  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Felix&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Luna&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Charlie&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=Milo&backgroundColor=d1f4d7',
  
  // 像素风格 (pixel-art)
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Bella&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Oliver&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Lucy&backgroundColor=c0aede',
  
  // 可爱卡通风格 (fun-emoji)
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Max&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Sophie&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Ruby&backgroundColor=c0aede',
  
  // 萌宠风格 (thumbs)
  'https://api.dicebear.com/7.x/thumbs/svg?seed=Leo&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/thumbs/svg?seed=Lily&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/thumbs/svg?seed=Oscar&backgroundColor=c0aede',
  
  // 简约风格 (shapes)
  'https://api.dicebear.com/7.x/shapes/svg?seed=Daisy&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/shapes/svg?seed=Rocky&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/shapes/svg?seed=Molly&backgroundColor=c0aede'
];

// AI专属头像URL - 使用特殊的机器人风格
const aiAvatarUrl = 'https://api.dicebear.com/7.x/bottts/svg?seed=AI&backgroundColor=c0aede&textureChance=100&mouthChance=100&sidesChance=100&topChance=100';

module.exports = {
  animalAvatars,
  aiAvatarUrl
}; 