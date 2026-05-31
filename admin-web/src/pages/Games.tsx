import { useEffect, useState } from 'react';
import { api, Game } from '../api';

// 클라이언트 web/img 에 들어있는 게임 이미지 파일명 (드롭다운 자동완성용)
const GAME_IMAGES = [
  'battleground.jpg', 'lol.jpg', 'valorant.jpg', 'lostark.jpg', 'suddenattack.jpg', 'overwatch2.jpg',
  'fifaonline4.jpg', 'diavlo4.webp', 'starcraft.jpg', 'wow.jpg', 'tft.jpg', 'eternalreturn.jpg',
  'blacksand.jpg', 'lineage.jpg', 'lineage2.jpg', 'lineageclassic.jpg', 'hearthstone.jpg', 'pathofexile2.jpg',
  'aion.jpg', 'aion2.jpg', 'archeage.jpg', 'bladensoul.png', 'cabal.jpg', 'closers.jpg', 'cyphers.jpg',
  'diablo2.jpg', 'elsword.jpg', 'finalfantasy.jpg', 'firstdescendant.jpg', 'lostsaga.jpg', 'mabinogi.jpg',
  'mir4.jpg', 'mu.jpg', 'ragnarok.jpg', 'stormgate.jpg', 'talesrunner.jpg', 'talesweaver.jpg',
  'throneandliberty.jpg', 'vindictus.jpg', 'windofblade.png',
];

export default function Games() {
  const [games, setGames] = useState<Game[]>([]);
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    setGames(await api.games());
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api.createGame(name.trim(), image.trim() || undefined);
      setName(''); setImage('');
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function changeImage(g: Game) {
    const v = prompt(`'${g.name}' 이미지 파일명 (web/img/)`, g.image ?? '');
    if (v === null) return;
    await api.setGameImage(g.id, v.trim());
    load();
  }

  async function del(id: number, gname: string) {
    if (!confirm(`'${gname}' 게임과 연결된 IP가 모두 삭제됩니다. 진행할까요?`))
      return;
    await api.deleteGame(id);
    load();
  }

  return (
    <div>
      <div className="page-title">게임 관리</div>
      <div className="page-sub">게임을 등록하면 공유기(IP)를 게임별로 배정할 수 있습니다.</div>

      <div className="card">
        <h3>게임 등록</h3>
        <form className="row" onSubmit={add}>
          <div className="field">
            <label>게임 이름</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 배틀그라운드" />
          </div>
          <div className="field">
            <label>이미지 파일명 (web/img/)</label>
            <input list="gameImages" value={image} onChange={(e) => setImage(e.target.value)} placeholder="battleground.jpg" />
            <datalist id="gameImages">
              {GAME_IMAGES.map((f) => <option key={f} value={f} />)}
            </datalist>
          </div>
          <button className="btn-primary" disabled={!name.trim()}>추가</button>
        </form>
        {err && <div className="error-msg">{err}</div>}
      </div>

      <div className="card">
        <h3>등록된 게임 ({games.length})</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>이름</th>
              <th>이미지</th>
              <th>현재 사용 중</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.id}>
                <td>{g.id}</td>
                <td>{g.name}</td>
                <td className="mono muted">{g.image ?? '-'}</td>
                <td>{g.inUse > 0 ? <span className="pill assigned">{g.inUse}명</span> : <span className="muted">0</span>}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-ghost" style={{ marginRight: 4 }} onClick={() => changeImage(g)}>이미지</button>
                  <button className="btn-danger" onClick={() => del(g.id, g.name)}>삭제</button>
                </td>
              </tr>
            ))}
            {games.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">등록된 게임이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>※ 게임은 계정에 고정하지 않습니다. 클라이언트에서 유저가 선택하며, 같은 IP에서 같은 게임은 동시 1명만 가능합니다.</p>
      </div>
    </div>
  );
}
