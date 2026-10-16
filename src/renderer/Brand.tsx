import mark from '../../assets/brand/mark.svg';
import smallMark from '../../assets/brand/mark-small.svg';
import appIcon from '../../assets/brand/app-icon-rounded.svg';
import horizontalLogo from '../../assets/brand/logo-horizontal.svg';
import inverseHorizontalLogo from '../../assets/brand/logo-horizontal-inverse.svg';

export function BrandMark({ small = false }: { small?: boolean }) {
  const source = small ? smallMark : mark;
  return <span className="brand-mark" aria-hidden="true" style={{ maskImage: `url("${source}")`, WebkitMaskImage: `url("${source}")` }} />;
}

export function BrandLogo() {
  return <span className="brand-lockup"><img className="brand-icon" src={appIcon} alt="" aria-hidden="true" /><span className="brand-wordmark"><img className="brand-light" src={horizontalLogo} alt="Pactime" /><img className="brand-dark" src={inverseHorizontalLogo} alt="Pactime" /></span></span>;
}
