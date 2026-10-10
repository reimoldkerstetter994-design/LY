// SI physical constants (CODATA 2018) and astronomical unit conversions.

export const C_M_S = 299_792_458;
export const C_KM_S = 299_792.458;
export const G_SI = 6.6743e-11;
export const K_B = 1.380649e-23;
export const H_PLANCK = 6.62607015e-34;
export const HBAR = H_PLANCK / (2 * Math.PI);
export const M_E = 9.1093837015e-31;
export const M_P = 1.67262192369e-27;
export const M_H = 1.6735575e-27;
export const SIGMA_T = 6.6524587321e-29;
export const EV_J = 1.602176634e-19;

export const AU_M = 1.495978707e11;
export const LY_M = 9.4607304725808e15;
export const PC_M = 3.0856775814913673e16;
export const KPC_M = PC_M * 1e3;
export const MPC_M = PC_M * 1e6;
export const GPC_M = PC_M * 1e9;
export const KLY_M = LY_M * 1e3;
export const MLY_M = LY_M * 1e6;
export const GLY_M = LY_M * 1e9;

export const DAY_S = 86_400;
export const YEAR_S = 365.25 * DAY_S;
export const MYR_S = 1e6 * YEAR_S;
export const GYR_S = 1e9 * YEAR_S;

export const MPC_LY = MPC_M / LY_M;
export const MPC_GLY = MPC_M / GLY_M;

export const SOLAR_MASS_KG = 1.98847e30;
export const SOLAR_RADIUS_M = 6.957e8;
export const EARTH_RADIUS_M = 6.371e6;

export const PLANCK_TIME_S = 5.391247e-44;

/** Critical density today divided by h^2, in kg/m^3: 3 (100 km/s/Mpc)^2 / (8 pi G). */
export const RHO_CRIT_H2 = (3 * (100e3 / MPC_M) ** 2) / (8 * Math.PI * G_SI);

/** Hubble time 1/H0 in Gyr for H0 given in km/s/Mpc. */
export const hubbleTimeGyr = (H0: number): number => MPC_M / 1e3 / H0 / GYR_S;

/** Hubble distance c/H0 in Mpc for H0 given in km/s/Mpc. */
export const hubbleDistanceMpc = (H0: number): number => C_KM_S / H0;

/** Photon density parameter times h^2 for a CMB temperature in K. */
export const omegaGammaH2 = (Tcmb: number): number => 2.47282e-5 * (Tcmb / 2.7255) ** 4;

/** Energy density of one species of massless neutrino relative to photons (7/8 (4/11)^(4/3)). */
export const NU_PER_GAMMA = (7 / 8) * (4 / 11) ** (4 / 3);

export const DEG = Math.PI / 180;
