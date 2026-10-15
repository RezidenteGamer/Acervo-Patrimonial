import { useRef, useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, Maximize2, Star, Trash2 } from 'lucide-react';
import type { Asset, PhotoMeta } from '../domain/models';
import { useInventory, usePhoto } from '../hooks/useInventory';
import { repositories } from '../services';
import { preparePhotos } from '../services/images';
import { errorMessage, formatDate } from '../lib/utils';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';
function PhotoPreview({ photo, onSelect }: { photo: PhotoMeta; onSelect: () => void }) {
  const url = usePhoto(photo.id, true);
  return (
    <button
      className={`gallery-thumb ${photo.principal ? 'is-primary' : ''}`}
      onClick={onSelect}
      aria-label={`Abrir fotografia${photo.principal ? ' principal' : ''}${photo.descricao ? `: ${photo.descricao}` : ''}`}
    >
      {url && <img src={url} alt={photo.descricao || 'Fotografia do equipamento'} />}
      {photo.principal && (
        <span>
          <Star size={10} fill="currentColor" /> Principal
        </span>
      )}
    </button>
  );
}
function ExpandedPhoto({ photo, onClose }: { photo: PhotoMeta; onClose: () => void }) {
  const url = usePhoto(photo.id);
  const { run } = useInventory();
  const [description, setDescription] = useState(photo.descricao);
  const [busy, setBusy] = useState(false);
  const action = async (fn: () => Promise<void>, success: string, close = false) => {
    setBusy(true);
    const ok = await run(fn, success);
    setBusy(false);
    if (ok && close) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Fotografia do patrimônio"
      description={`Incluída em ${formatDate(photo.criadaEm)}`}
      wide
    >
      <div className="photo-expanded">
        {url ? (
          <img src={url} alt={photo.descricao || 'Fotografia ampliada do equipamento'} />
        ) : (
          <p>Carregando fotografia…</p>
        )}
      </div>
      <label className="field">
        <span>Descrição da fotografia</span>
        <input
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex.: plaqueta com número de série"
        />
      </label>
      <div className="photo-actions">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                'Remover esta fotografia permanentemente? Esta ação não pode ser desfeita.',
              )
            )
              void action(() => repositories.photos.remove(photo.id), 'Fotografia removida.', true);
          }}
        >
          <Trash2 size={16} />
          Remover
        </Button>
        <div>
          {!photo.principal && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void action(
                  () => repositories.photos.setPrimary(photo.id),
                  'Fotografia principal atualizada.',
                  true,
                )
              }
            >
              <Star size={16} />
              Tornar principal
            </Button>
          )}
          <Button
            disabled={busy}
            onClick={() =>
              void action(
                () => repositories.photos.describe(photo.id, description),
                'Descrição salva.',
                true,
              )
            }
          >
            Salvar descrição
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
export function PhotoGallery({ asset, photos }: { asset: Asset; photos: PhotoMeta[] }) {
  const { run, notify } = useInventory();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const main = photos.find((p) => p.principal) ?? photos[0];
  const url = usePhoto(main?.id);
  async function upload(files: File[]) {
    if (busy || !files.length) return;
    setBusy(true);
    setProgress(0);
    try {
      if (asset.fotoCount + files.length > 30)
        throw new Error('Cada patrimônio pode ter até 30 fotografias.');
      const prepared = await preparePhotos(files, setProgress);
      await run(() => repositories.photos.add(asset.id, prepared), 'Fotografias adicionadas.');
    } catch (e) {
      notify(errorMessage(e), true);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
      if (camera.current) camera.current.value = '';
    }
  }
  return (
    <section className="photo-section">
      <div className="section-heading">
        <h3>
          Fotografias <span>{photos.length}</span>
        </h3>
        <div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => camera.current?.click()}>
            <Camera size={15} />
            Câmera
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={15} />
            Adicionar fotos
          </Button>
        </div>
      </div>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => void upload(Array.from(e.target.files ?? []))}
        aria-label="Selecionar fotografias"
      />
      <input
        ref={camera}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void upload(Array.from(e.target.files ?? []))}
        aria-label="Capturar fotografia"
      />
      <div
        className={`photo-drop ${dragging ? 'dragging' : ''} ${main ? 'has-photo' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
      >
        {busy ? (
          <div className="photo-empty">
            <LoaderCircle className="spin" size={28} />
            <strong>Preparando fotografias</strong>
            <span>{progress} imagem(ns) processada(s). Aguarde o salvamento.</span>
          </div>
        ) : main ? (
          <button
            className="main-photo"
            onClick={() => setExpanded(main.id)}
            aria-label="Ampliar fotografia principal"
          >
            {url && <img src={url} alt={main.descricao || `Fotografia de ${asset.nome}`} />}
            <span>
              <Maximize2 size={15} /> Ampliar
            </span>
          </button>
        ) : (
          <button className="photo-empty" onClick={() => input.current?.click()}>
            <div className="empty-photo-icon">
              <Camera size={26} strokeWidth={1.5} />
            </div>
            <strong>Um registro mais completo começa com uma foto</strong>
            <span>Arraste imagens aqui ou clique para selecionar</span>
            <small>JPEG, PNG ou WebP · até 20 MB por imagem</small>
          </button>
        )}
      </div>
      {photos.length > 0 && (
        <div className="gallery">
          {photos.map((p) => (
            <PhotoPreview key={p.id} photo={p} onSelect={() => setExpanded(p.id)} />
          ))}
        </div>
      )}
      {photos.find((p) => p.id === expanded) && (
        <ExpandedPhoto
          key={expanded}
          photo={photos.find((p) => p.id === expanded)!}
          onClose={() => setExpanded(undefined)}
        />
      )}
    </section>
  );
}
