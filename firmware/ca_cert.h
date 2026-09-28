#ifndef CA_CERT_H
#define CA_CERT_H

// Self-signed certificate used by the backend (infra/certs/cert.pem on the Webapp_Anto
// branch, CN=transcendence.local). This is a PUBLIC certificate, not a secret like
// secrets.h — safe to commit as-is. It's pinned directly as the trusted CA: since the
// backend's cert is self-signed (its own issuer), the firmware trusts exactly this one
// certificate rather than any public certificate authority. If the server ever gets a
// new certificate, this file must be regenerated from the new cert.pem to match.
const char* ROOT_CA_CERT = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDHTCCAgWgAwIBAgIUBl6aTdt2ENI+exYCLsxaXvaF1mMwDQYJKoZIhvcNAQEL
BQAwHjEcMBoGA1UEAwwTdHJhbnNjZW5kZW5jZS5sb2NhbDAeFw0yNjA5MDQxODU4
NDBaFw0yNzA5MDQxODU4NDBaMB4xHDAaBgNVBAMME3RyYW5zY2VuZGVuY2UubG9j
YWwwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCoBkOPs3KYxNfLH25L
zt3MQGGUmPsy+0ysqk8uIheL3ejIAS2Le42UCUaDw81LSfYFJ7j3QF2vw6+LPP0T
RZU3ymtnowkFkdlkt6TZWYL5rcptvM9fvZjE39tBQb8SXE/RHr5zCls4geg5tYNy
Im5e1NfkJn/YfsHsMaaJ1OYCSXtFb9WohVGqngCc2iRtWemX0kZVWmxelg1QvgDR
XQ0Iqz0tTz5Eh1C6dYDIXDBC99l2J62Z3F7QheiojE60RMX5ZPqXqV6kekipYs8o
/QbT4pyRD2uCJ/DI+Gaj2pyGzguHYSK298P22JR2ZU4ecTOf8+lwDvWKzrOPj2N6
gjLTAgMBAAGjUzBRMB0GA1UdDgQWBBQMvy4Rtd9d9QK7ADIuAlmrK+s4BzAfBgNV
HSMEGDAWgBQMvy4Rtd9d9QK7ADIuAlmrK+s4BzAPBgNVHRMBAf8EBTADAQH/MA0G
CSqGSIb3DQEBCwUAA4IBAQBNxuqdH8FxIyziD9BZdzSvAiX6CA6iqwwk3Oo1OT/O
PaomG7+Rc367ChSH/f4ODsvsPThOraWuYRj1JjPg3TAyaYDPd270UqYUctHDEmjq
Q0z5nway13pqNSk6MNUVDhKjiWYYOKHXXfIYe/WQkfpTkWSX0QVM2UchU2Fj3Y1o
KZkR6R+dVWx14Z2mzA3oM0m6uHihULYFIR4IUGxXSkKgxhuq+LpDrhhCrOStQkm/
F9N8NOgDNqvewU/S4qDUqe+4YJPTD77v8rvjv13wzzsl9fsY/Y8nEVRcr1rnPbCq
dK/luBrBC/7BA+8/B8yQM8j3aygCE/L9D1bye3VcgQ/a
-----END CERTIFICATE-----
)EOF";

#endif
