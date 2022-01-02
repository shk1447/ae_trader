import axios from "axios";

const base_url = import.meta.env.DEV
  ? "http://localhost"
  : "http://stock.vases.ai";

export const get = (url, data, config = {}) => {
  const requestOptions = {
    ...config,
    params: data,
  };
  return axios
    .get(base_url + url, requestOptions)
    .then((response) => {
      return response;
    })
    .catch((err) => {
      return err.response;
    });
};

export const post = (url, data, config = {}) => {
  return axios
    .post(url, data, config)
    .then((response) => {
      return response;
    })
    .catch((err) => {
      return err.response;
    });
};
