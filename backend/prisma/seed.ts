/**
 * 초기 데이터 시드 (v2 — 계정 단위)
 *  - 관리자 admin/admin1234, 사용자 user1/user1234
 *  - 게임 2개
 *  - 공유기 2대 (각 PSK) + 공유기당 계정 5개(게임 섞어서)
 *
 *  실행:  npm run seed
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { encrypt, generateL2tpCredentials } from '../src/common/crypto.util';

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash('admin1234', 10);
  const userHash = await bcrypt.hash('user1234', 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash: adminHash, role: 'admin' },
  });
  await prisma.user.upsert({
    where: { username: 'user1' },
    update: {},
    create: { username: 'user1', passwordHash: userHash, role: 'user', paid: true },
  });

  const gameList = [
    { name: '배틀그라운드', image: 'battleground.jpg' },
    { name: '리그오브레전드', image: 'lol.jpg' },
    { name: '발로란트', image: 'valorant.jpg' },
    { name: '로스트아크', image: 'lostark.jpg' },
    { name: '서든어택', image: 'suddenattack.jpg' },
    { name: '오버워치2', image: 'overwatch2.jpg' },
    { name: 'FIFA 온라인 4', image: 'fifaonline4.jpg' },
    { name: '디아블로4', image: 'diavlo4.webp' },
    { name: '디아블로2', image: 'diablo2.jpg' },
    { name: '스타크래프트', image: 'starcraft.jpg' },
    { name: '월드오브워크래프트', image: 'wow.jpg' },
    { name: 'TFT', image: 'tft.jpg' },
    { name: '이터널리턴', image: 'eternalreturn.jpg' },
    { name: '검은사막', image: 'blacksand.jpg' },
    { name: '하스스톤', image: 'hearthstone.jpg' },
    { name: '패스오브엑자일2', image: 'pathofexile2.jpg' },
    { name: '리니지', image: 'lineage.jpg' },
    { name: '리니지2', image: 'lineage2.jpg' },
    { name: '리니지 클래식', image: 'lineageclassic.jpg' },
    { name: '아이온', image: 'aion.jpg' },
    { name: '아이온2', image: 'aion2.jpg' },
    { name: '아키에이지', image: 'archeage.jpg' },
    { name: '블레이드앤소울', image: 'bladensoul.png' },
    { name: '카발', image: 'cabal.jpg' },
    { name: '클로저스', image: 'closers.jpg' },
    { name: '사이퍼즈', image: 'cyphers.jpg' },
    { name: '엘소드', image: 'elsword.jpg' },
    { name: '파이널판타지14', image: 'finalfantasy.jpg' },
    { name: '퍼스트디센던트', image: 'firstdescendant.jpg' },
    { name: '로스트사가', image: 'lostsaga.jpg' },
    { name: '마비노기', image: 'mabinogi.jpg' },
    { name: '마비노기 영웅전', image: 'vindictus.jpg' },
    { name: '미르4', image: 'mir4.jpg' },
    { name: '뮤', image: 'mu.jpg' },
    { name: '라그나로크', image: 'ragnarok.jpg' },
    { name: '스톰게이트', image: 'stormgate.jpg' },
    { name: '테일즈런너', image: 'talesrunner.jpg' },
    { name: '테일즈위버', image: 'talesweaver.jpg' },
    { name: '쓰론앤리버티', image: 'throneandliberty.jpg' },
    { name: '바람의나라', image: 'windofblade.png' },
  ];
  const games: any[] = [];
  for (const g of gameList) {
    games.push(
      await prisma.game.upsert({
        where: { name: g.name },
        update: { image: g.image },
        create: { name: g.name, image: g.image },
      }),
    );
  }

  // 공유기 2대 (헬스체크 통과하도록 host는 로컬 백엔드 가리킴 — 샘플 한정)
  const regions = ['서울', '부산'];
  for (let i = 1; i <= 2; i++) {
    const ipAddress = `203.0.10.${i}`;
    const ip = await prisma.vpnIp.upsert({
      where: { ipAddress },
      update: {},
      create: {
        ipAddress,
        host: '127.0.0.1',
        port: 3000,
        protocol: 'l2tp',
        pskEnc: encrypt(`psk-sample-${i}`),
        brand: 'iptime',
        model: 'A3004',
        region: regions[i - 1],
        adminUrl: `http://${ipAddress}:8080`,
        adminUsername: 'admin',
        adminPasswordEnc: encrypt('routerAdminPw'),
      },
    });

    // 공유기당 계정 5개 (게임은 유저가 연결 시 선택)
    const exist = await prisma.vpnAccount.count({ where: { vpnIpId: ip.id } });
    if (exist === 0) {
      for (let k = 0; k < 5; k++) {
        const gen = generateL2tpCredentials();
        await prisma.vpnAccount.create({
          data: { vpnIpId: ip.id, username: gen.username, passwordEnc: encrypt(gen.password) },
        });
      }
    }
  }

  console.log('✅ 시드 완료 (v2)');
  console.log('   관리자: admin/admin1234, 사용자: user1/user1234');
  console.log('   공유기 2대 × 계정 5개 = 10계정');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
