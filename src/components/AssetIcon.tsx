import { Armchair, CarFront, Construction, Monitor, Package, Truck, Wrench } from 'lucide-react';
import type { Asset } from '../domain/models';
import { usePhoto } from '../hooks/useInventory';
export function AssetIcon({ asset }: { asset: Asset }) {
  const url = usePhoto(asset.fotoPrincipalId, true);
  const Icon =
    asset.categoriaId === 'veiculos'
      ? CarFront
      : asset.categoriaId === 'caminhoes'
        ? Truck
        : asset.categoriaId === 'maquinas'
          ? Construction
          : asset.categoriaId === 'informatica'
            ? Monitor
            : asset.categoriaId === 'mobiliario'
              ? Armchair
              : ['rocadeiras', 'ferramentas', 'eletricos'].includes(asset.categoriaId)
                ? Wrench
                : Package;
  return (
    <span className={`asset-icon category-${asset.categoriaId || 'outros'}`}>
      {url ? <img src={url} alt="" loading="lazy" /> : <Icon size={23} strokeWidth={1.65} />}
    </span>
  );
}
