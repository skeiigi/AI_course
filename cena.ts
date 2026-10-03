const zaprosovVDen = 40;
const dniVMesyace = 22;
const vhodnyhTokenov = 8000; // запрос вместе с приложенными файлами
const vyhodnyhTokenov = 1200; // ответ модели
const cenaVhoda = 3 / 1000000; // доллары за один входной токен
const cenaVyhoda = 15 / 1000000; // выход дороже входа в пять раз
const vhod = zaprosovVDen * dniVMesyace * vhodnyhTokenov;
const vyhod = zaprosovVDen * dniVMesyace * vyhodnyhTokenov;
const stoimost = vhod * cenaVhoda + vyhod * cenaVyhoda;
console.log('Входных токенов за месяц:', vhod);
console.log('Выходных токенов за месяц:', vyhod);
console.log('Стоимость месяца, доллары:', stoimost.toFixed(2));